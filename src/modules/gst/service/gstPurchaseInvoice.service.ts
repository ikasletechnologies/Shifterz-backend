import { db } from '../../../lib/db.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { GstCalculationService } from './gstCalculation.service.js';
import { GstTransactionLedgerService } from './gstTransactionLedger.service.js';
import { logAudit } from '../../../shared/services/audit.service.js';
import { groupCalculatedLinesForLedger } from './purchaseValidation.helper.js';
import type { AttachPurchaseInvoiceDTO } from '../validation/purchaseInvoice.validation.js';

export interface PurchaseActor {
  id?: string;
  role?: string;
}

// Purchase GST/ITC foundation — the input side of the same architecture
// already used for sales (GstInvoiceResolverService) and CN/DN
// (GstCreditNoteService/GstDebitNoteService): resolve identity, calculate
// via the one shared GstCalculationService, write an immutable snapshot and
// ledger rows atomically. Never a second GST math engine.
//
// Role reversal from the sales side: the Vendor is the "seller" in
// GstCalculationService's terms (they invoiced us), and the company itself
// (Setting — the same company-wide identity GstInvoiceResolverService.
// resolveSeller() already falls back to for franchise-less invoices) is the
// "buyer". PurchaseOrder has no franchiseId — purchases are HQ-global
// throughout this codebase, confirmed during the GSTR-2B investigation, not
// a scope this phase invents.
//
// Reverse charge is explicitly OUT OF SCOPE for this phase — every purchase
// resolved here is treated as a standard (non-RCM) supply. ITC eligibility
// is an explicit actor-supplied assertion (per invoice, optionally
// overridden per line), never auto-inferred from a rule set that doesn't
// exist yet — consistent with "do not invent complex reverse-charge/ITC
// accounting."
export class GstPurchaseInvoiceService {
  private readonly calcEngine = new GstCalculationService();
  private readonly ledger = new GstTransactionLedgerService();

  async attachInvoice(purchaseOrderId: string, input: AttachPurchaseInvoiceDTO, actor?: PurchaseActor) {
    const order = await db.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, include: { vendor: true } });
    if (!order || order.isDeleted) throw new NotFoundError('Purchase Order not found.');

    if (order.stage === 'INVOICED' || order.stage === 'PAID') {
      throw new ValidationError('A purchase invoice has already been attached to this purchase order.');
    }
    if (order.stage !== 'RECEIVED') {
      throw new ValidationError(`Goods must be received before a purchase invoice can be attached (current stage: "${order.stage}").`);
    }
    if (!order.vendor.state) {
      throw new ValidationError('This vendor has no GST state on file — set Vendor.state before attaching a GST-bearing purchase invoice.');
    }

    const setting = await db.setting.findUnique({ where: { id: 'default' } });
    if (!setting?.state) {
      throw new ValidationError('Company GST state is not configured in Settings — cannot determine place of supply for a purchase.');
    }

    const gstResult = this.calcEngine.calculate({
      sellerGstin: order.vendor.gstNumber || null,
      sellerState: order.vendor.state,
      buyerGstin: setting.gstin || null,
      buyerState: setting.state,
      lineItems: input.lines.map((l) => ({
        description: l.description,
        unitPrice: l.rate,
        quantity: l.quantity ?? 1,
        hsnSac: l.hsnSac ?? null,
        gstRate: l.gstRate,
        cessRate: l.cessRate,
      })),
    });

    const invoiceDate = input.invoiceDate ? new Date(input.invoiceDate) : new Date();

    const updated = await db.$transaction(async (tx) => {
      const savedOrder = await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: {
          invoiceNumber: input.invoiceNumber,
          invoiceDate,
          stage: 'INVOICED',
          vendorGstin: gstResult.meta.sellerGstin,
          vendorState: gstResult.meta.sellerState,
          hsnSac: gstResult.lines.length === 1 ? gstResult.lines[0]?.hsnSac ?? null : null,
          taxableValue: gstResult.taxableAmount,
          cgst: gstResult.cgst,
          sgst: gstResult.sgst,
          igst: gstResult.igst,
          cess: gstResult.cess,
          placeOfSupply: gstResult.placeOfSupply,
          supplyType: gstResult.supplyType,
          itcEligible: input.itcEligible,
        },
      });

      await tx.purchaseOrderLine.createMany({
        data: gstResult.lines.map((line, i) => ({
          purchaseOrderId,
          description: input.lines[i]?.description ?? line.description ?? '',
          sku: input.lines[i]?.sku ?? null,
          hsnSac: line.hsnSac,
          quantity: input.lines[i]?.quantity ?? 1,
          unitPrice: input.lines[i]?.rate ?? 0,
          taxableAmount: line.taxableAmount,
          gstRate: line.gstRate,
          cgst: line.cgst,
          sgst: line.sgst,
          igst: line.igst,
          cess: line.cess,
          lineTotal: line.lineTotal,
          itcEligible: input.lines[i]?.itcEligible ?? input.itcEligible,
        })),
      });

      // Static-review fix — GstCalculationService returns one output line per
      // submitted input line (needed as-is for PurchaseOrderLine above, which
      // must preserve one row per actual invoice line). The ledger, however,
      // must have one row per (rate, HSN, ITC-eligibility) group, same as the
      // sales/CN/DN architecture (GST-07) — writing one row per input line
      // here would silently violate that whenever a purchase invoice has two
      // lines at the same rate+HSN. Grouping the already-calculated output
      // (not re-deriving tax — still a single calculate() call above) avoids
      // a second GST math path while producing correctly-grouped rows.
      const ledgerGroups = groupCalculatedLinesForLedger(
        gstResult.lines,
        (i) => input.lines[i]?.itcEligible ?? input.itcEligible
      );

      for (const group of ledgerGroups) {
        await this.ledger.record({
          franchiseId: null,
          documentType: 'PURCHASE',
          documentId: savedOrder.id,
          documentNumber: savedOrder.invoiceNumber || savedOrder.orderNumber,
          documentDate: invoiceDate,
          sellerGstin: gstResult.meta.sellerGstin,
          buyerGstin: gstResult.meta.buyerGstin,
          buyerName: setting.companyName,
          sellerState: gstResult.meta.sellerState,
          placeOfSupply: gstResult.placeOfSupply,
          supplyType: gstResult.supplyType,
          hsnSac: group.hsnSac,
          gstRate: group.gstRate,
          taxableValue: group.taxableValue,
          cgst: group.cgst,
          sgst: group.sgst,
          igst: group.igst,
          cess: group.cess,
          itcEligible: group.itcEligible,
        }, tx);
      }

      return savedOrder;
    });

    await logAudit({
      module: 'Purchase GST',
      recordId: purchaseOrderId,
      action: 'ATTACH_INVOICE',
      userId: actor?.id || 'unknown',
      branchId: null,
      oldValue: { stage: order.stage, invoiceNumber: order.invoiceNumber },
      newValue: updated,
    });

    return updated;
  }
}
