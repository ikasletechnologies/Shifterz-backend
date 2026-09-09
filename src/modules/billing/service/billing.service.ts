import { BillingRepository } from '../repository/billing.repository.js';
import type { CreateInvoiceDTO, UpdateInvoiceDTO } from '../validation/billing.validation.js';
import { db } from '../../../lib/db.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError.js';
import { logAudit } from '../../../shared/services/audit.service.js';
import { notifyCustomer, notifyManagers } from '../../../shared/services/notification.service.js';
import { WarrantyService } from '../../warranty/service/warranty.service.js';
import { applyServiceWarrantyDefaults, type InvoiceLineItemLike } from './serviceWarrantyDefault.helper.js';
import { resolveDataScope, scopeWhere } from '../../../shared/scope/dataScope.js';
import { GstInvoiceResolverService } from '../../gst/service/gstInvoiceResolver.service.js';
import type { GstCalculationResult } from '../../gst/service/gstCalculation.service.js';
import { GstTransactionLedgerService } from '../../gst/service/gstTransactionLedger.service.js';
import type { Prisma } from '@prisma/client';

// 13.14: HQ is notified when an overall discount looks abnormal.
const ABNORMAL_DISCOUNT_THRESHOLD_PERCENT = 20;

export interface BillingActor {
  id?: string;
  name?: string;
  role?: string;
  franchiseId?: string | null;
}

export class BillingService {
  private readonly gstResolver = new GstInvoiceResolverService();
  private readonly gstLedger = new GstTransactionLedgerService();

  constructor(private readonly repository: BillingRepository = new BillingRepository()) {}

  // GST-05, amended by GST-07 — records one ledger row per resolved (rate,
  // HSN) group, not one aggregate row per invoice: GSTR-1's HSN-wise and
  // rate-wise summaries need real per-group figures, which an invoice-level
  // aggregate can't provide once an invoice has more than one applicable
  // rate. Deliberately NOT wrapped in try/catch: the ledger is "the single
  // reporting source," so a failure here must surface as a real error on the
  // request, not be silently swallowed the way the notification/warranty
  // side effects elsewhere in this file are.
  // GST-05A — callers now always pass the same `tx` the invoice write itself
  // runs in, so a crash partway through rolls back both together; there is
  // no longer a window where an invoice can exist with a partial or missing
  // ledger entry.
  private async recordInvoiceLedgerEntry(
    invoice: { id: string; franchiseId: string | null; date: Date; client?: string | null },
    gstResult: GstCalculationResult,
    tx: Prisma.TransactionClient
  ) {
    for (const line of gstResult.lines) {
      await this.gstLedger.record({
        franchiseId: invoice.franchiseId,
        documentType: 'INVOICE',
        documentId: invoice.id,
        documentNumber: invoice.id,
        documentDate: invoice.date,
        sellerGstin: gstResult.meta.sellerGstin,
        buyerGstin: gstResult.meta.buyerGstin,
        buyerName: invoice.client ?? null,
        sellerState: gstResult.meta.sellerState,
        placeOfSupply: gstResult.placeOfSupply,
        supplyType: gstResult.supplyType,
        hsnSac: line.hsnSac,
        gstRate: line.gstRate,
        taxableValue: line.taxableAmount,
        cgst: line.cgst,
        sgst: line.sgst,
        igst: line.igst,
        cess: line.cess,
      }, tx);
    }
  }

  async getAllInvoices(franchiseId?: string | null) {
    const list = await this.repository.findAll(franchiseId);
    const payments = await this.repository.findAllPayments();

    return list.map(inv => {
      const invPayments = payments.filter(p => p.invoiceId === inv.id);
      const paidAmount = invPayments.reduce((sum, p) => sum + p.amount, 0);
      return { ...inv, paidAmount };
    });
  }

  // 12.11.4: No vehicle shall proceed to billing until QC is marked as Passed.
  // Only enforced for actual Invoices linked to a job (Quotations/Estimates
  // are pre-service documents, not billing, and non-job invoices are unaffected).
  // Step 3 Item #5 — this is the single canonical QC gate: both createInvoice
  // and convertInvoice call it, so a Quotation/Estimate can't be converted
  // into a billable Invoice as a second, undocumented way around the same rule.
  // GST-12 — franchiseId is required whenever the invoice itself has one, so a
  // jobId that happens to belong to a different franchise can't be billed
  // against; this fails closed with "Job not found" rather than silently
  // pulling another franchise's job into scope.
  private async assertQcPassedForInvoice(jobId: string, type: string, franchiseId: string | null): Promise<void> {
    if (!jobId || type !== 'Invoice') return;
    const job = await db.job.findFirst({ where: { id: jobId, isDeleted: false, ...(franchiseId ? { franchiseId } : {}) } });
    if (!job) throw new ValidationError(`Job ${jobId} not found`);
    if (!job.passedAt) {
      throw new ValidationError(
        `Job ${jobId} has not passed Quality Control yet (current status: "${job.status}"). Billing cannot proceed until QC is passed.`
      );
    }
  }

  async createInvoice(data: CreateInvoiceDTO, actor?: BillingActor) {
    if (data.jobId) {
      await this.assertQcPassedForInvoice(data.jobId, data.type, data.franchiseId ?? null);
    }

    // WTY-01C (D-W1, locked) — server-side authoritative Service Master
    // warranty default. Only real Invoices are finalized documents in the
    // warranty sense (same gate GST resolution below already uses); an
    // explicit billing-supplied warranty (per item or invoice-level)
    // always wins, this only fills in what's missing.
    if (data.type === 'Invoice') {
      const services = await db.service.findMany({ where: { isDeleted: false }, select: { name: true, warranty: true } });
      const serviceWarrantyByName = new Map(services.map((s) => [s.name.trim().toLowerCase(), s.warranty]));
      const itemsArray = Array.isArray(data.items) ? (data.items as InvoiceLineItemLike[]) : undefined;
      const defaulted = applyServiceWarrantyDefaults(itemsArray, data.service, data.warranty, serviceWarrantyByName);
      if (itemsArray) (data as any).items = defaulted.items;
      (data as any).warranty = defaulted.warranty;
    }

    // GST-03 — the backend is the sole GST authority for a real Invoice.
    // Quotations/Estimates aren't tax documents (same scoping as the QC gate
    // above) and keep the old flat gst passthrough unchanged for now.
    let gstResult: GstCalculationResult | undefined;
    if (data.type === 'Invoice') {
      gstResult = await this.gstResolver.resolve({
        franchiseId: data.franchiseId ?? null,
        jobId: data.jobId ?? null,
        buyerPhone: data.phone ?? null,
        buyerGstin: data.gstNumber ?? null,
        buyerState: data.buyerState ?? null,
        amount: Number(data.amount || 0),
        discount: Number(data.discount || 0),
        manualGstRate: data.manualGstRate !== undefined && data.manualGstRate !== null ? Number(data.manualGstRate) : null,
        manualHsnSac: data.manualHsnSac ?? null,
      });
    }

    const date = new Date(data.date || Date.now());
    const year = date.getFullYear();
    const month = date.getMonth();
    const startYear = month >= 3 ? year : year - 1;
    const endYear = startYear + 1;
    const fy = `${startYear.toString().slice(2)}-${endYear.toString().slice(2)}`;

    const docTypePrefix = {
      Invoice: `STZ-${fy}-`,
      Quotation: `STZ-QT-${fy}-`,
      Estimate: `STZ-EST-${fy}-`,
    }[data.type] || `STZ-DOC-${fy}-`;

    const sequenceNumber = await this.repository.allocateSequence(docTypePrefix);
    const invId = `${docTypePrefix}${sequenceNumber}`;

    // GST-05A — invoice write and its GstTransaction ledger rows commit or
    // roll back together; there is never a state where one exists without
    // the other.
    const invoice = await db.$transaction(async (tx) => {
      const created = await this.repository.create(invId, docTypePrefix, sequenceNumber, data, gstResult, tx);
      if (gstResult) {
        await this.recordInvoiceLedgerEntry(created, gstResult, tx);
      }
      return created;
    });

    await logAudit({
      module: "billing",
      recordId: invoice.id,
      action: "create",
      userId: actor?.id || "system",
      branchId: invoice.franchiseId,
      newValue: invoice,
    });

    if (data.type === "Invoice" && invoice.phone) {
      await notifyCustomer(invoice.phone, null, "Invoice Generated", `Your invoice ${invoice.id} for ${invoice.vehicle} has been generated.`);
    }

    const subtotal = Number(data.amount || 0);
    const discountPercent = subtotal > 0 ? (Number(data.discount || 0) / subtotal) * 100 : 0;
    if (discountPercent > ABNORMAL_DISCOUNT_THRESHOLD_PERCENT) {
      await notifyManagers(
        invoice.franchiseId,
        "Abnormal Discount",
        `Invoice ${invoice.id} was created with a ${discountPercent.toFixed(1)}% discount.`
      );
    }

    if (data.type === "Invoice") {
      try {
        const warrantyService = new WarrantyService();
        await warrantyService.generateFromInvoice(invoice.id);
      } catch (err) {
        // ignore if invoice has no warranty items
      }
    }

    return invoice;
  }

  async updateInvoice(id: string, data: UpdateInvoiceDTO, actor?: BillingActor) {
    const scope = resolveDataScope(actor);
    const existing = await this.repository.findById(id, scopeWhere(scope));
    if (!existing) throw new NotFoundError("Invoice not found");

    const auditData: any = {};
    if (data.modifiedBy) auditData.modifiedBy = data.modifiedBy;
    if (data.status === "Cancelled" && existing?.status !== "Cancelled") auditData.cancelledBy = data.modifiedBy || data.cancelledBy;
    if (data.status === "Approved" && existing?.status !== "Approved") auditData.approvedBy = data.modifiedBy || data.approvedBy;

    const updateData = {
      ...auditData,
      status: data.status !== undefined ? data.status : undefined,
      notes: data.notes !== undefined ? data.notes : undefined,
      date: data.date ? new Date(data.date) : undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      amount: data.amount !== undefined ? Number(data.amount) : undefined,
      gst: data.gst !== undefined ? Number(data.gst) : undefined,
      discount: data.discount !== undefined ? Number(data.discount) : undefined,
      type: data.type !== undefined ? data.type : undefined,
      client: data.client !== undefined ? data.client : undefined,
      phone: data.phone !== undefined ? data.phone : undefined,
      vehicle: data.vehicle !== undefined ? data.vehicle : undefined,
      service: data.service !== undefined ? data.service : undefined,
      items: data.items !== undefined ? data.items : undefined,
      bankDetails: data.bankDetails !== undefined ? data.bankDetails : undefined,
      paymentTerms: data.paymentTerms !== undefined ? data.paymentTerms : undefined,
      deliveryTerms: data.deliveryTerms !== undefined ? data.deliveryTerms : undefined,
      authorizedSignatory: data.authorizedSignatory !== undefined ? data.authorizedSignatory : undefined,
      warranty: data.warranty !== undefined ? data.warranty : undefined,
      discountReason: data.discountReason !== undefined ? data.discountReason : undefined,
    };

    const updated = await this.repository.update(id, updateData);

    await logAudit({
      module: "billing",
      recordId: id,
      action: "update",
      userId: actor?.id || "system",
      branchId: updated.franchiseId,
      oldValue: existing,
      newValue: updated,
    });

    if (updated.type === "Invoice" && (updated.status === "Completed" || updated.status === "Paid")) {
      try {
        const warrantyService = new WarrantyService();
        await warrantyService.generateFromInvoice(updated.id);
      } catch (err) {
        // ignore if invoice has no warranty items
      }
    }

    return updated;
  }

  async convertInvoice(
    oldId: string,
    newType: string,
    updates: { amount?: number, gst?: number, discount?: number, buyerState?: string | null, manualGstRate?: number | null, manualHsnSac?: string | null },
    actor?: BillingActor
  ) {
    const scope = resolveDataScope(actor);
    const existing = await this.repository.findById(oldId, scopeWhere(scope));
    if (!existing) throw new NotFoundError("Invoice not found");

    if (existing.jobId) {
      await this.assertQcPassedForInvoice(existing.jobId, newType, existing.franchiseId ?? null);
    }

    // GST-03 — same rule as createInvoice: converting INTO an Invoice makes
    // the backend the GST authority from that point on. Converting between
    // two non-Invoice types (Quotation<->Estimate) is unaffected.
    let gstResult: GstCalculationResult | undefined;
    if (newType === 'Invoice') {
      gstResult = await this.gstResolver.resolve({
        franchiseId: existing.franchiseId ?? null,
        jobId: existing.jobId ?? null,
        buyerPhone: existing.phone ?? null,
        buyerGstin: existing.gstNumber ?? null,
        buyerState: updates.buyerState ?? null,
        amount: updates.amount !== undefined ? Number(updates.amount) : existing.amount,
        discount: updates.discount !== undefined ? Number(updates.discount) : existing.discount,
        manualGstRate: updates.manualGstRate !== undefined && updates.manualGstRate !== null ? Number(updates.manualGstRate) : null,
        manualHsnSac: updates.manualHsnSac ?? null,
      });
    }

    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth();
    const startYear = month >= 3 ? year : year - 1;
    const endYear = startYear + 1;
    const fy = `${startYear.toString().slice(2)}-${endYear.toString().slice(2)}`;

    const docTypePrefix = {
      Invoice: `STZ-${fy}-`,
      Quotation: `STZ-QT-${fy}-`,
      Estimate: `STZ-EST-${fy}-`,
    }[newType] || `STZ-DOC-${fy}-`;

    const sequenceNumber = await this.repository.allocateSequence(docTypePrefix);
    const newId = `${docTypePrefix}${sequenceNumber}`;

    // Ensure we release the old sequence number if applicable
    if (existing.numberPrefix && existing.sequenceNumber != null) {
      await this.repository.releaseSequenceIfLast(existing.numberPrefix, existing.sequenceNumber);
    }

    const updateData: any = {
      id: newId,
      type: newType,
      numberPrefix: docTypePrefix,
      sequenceNumber: sequenceNumber,
      date: date,
      status: "Pending", // Or whatever the initial status should be
    };
    if (updates.amount !== undefined) updateData.amount = Number(updates.amount);
    if (updates.gst !== undefined) updateData.gst = Number(updates.gst);
    if (updates.discount !== undefined) updateData.discount = Number(updates.discount);

    if (gstResult) {
      // Authoritative GST snapshot supersedes any client-supplied amount/gst above.
      updateData.amount = gstResult.taxableAmount;
      updateData.gst = gstResult.totalTax;
      updateData.gstNumber = gstResult.meta.buyerGstin;
      updateData.sellerGstin = gstResult.meta.sellerGstin;
      updateData.sellerState = gstResult.meta.sellerState;
      updateData.buyerState = gstResult.meta.buyerState;
      updateData.placeOfSupply = gstResult.placeOfSupply;
      updateData.supplyType = gstResult.supplyType;
      updateData.taxableAmount = gstResult.taxableAmount;
      updateData.cgst = gstResult.cgst;
      updateData.sgst = gstResult.sgst;
      updateData.igst = gstResult.igst;
      updateData.cess = gstResult.cess;
      updateData.hsnSac = gstResult.lines.length === 1 ? gstResult.lines[0]?.hsnSac ?? null : null;
      updateData.gstCalculationMeta = JSON.parse(JSON.stringify(gstResult));
    }

    // Swap the ID in a transaction to ensure related payments also update.
    // GST-05A — the ledger rows for the newly-converted invoice are written
    // in the same transaction, not as a separate call afterward, so they
    // commit or roll back together with the conversion itself.
    await db.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: oldId },
        data: updateData,
      });
      await tx.payment.updateMany({
        where: { invoiceId: oldId },
        data: { invoiceId: newId },
      });
      if (gstResult) {
        await this.recordInvoiceLedgerEntry(
          { id: newId, franchiseId: existing.franchiseId ?? null, date, client: existing.client },
          gstResult,
          tx
        );
      }
    });

    const converted = await this.repository.findById(newId);

    await logAudit({
      module: "billing",
      recordId: newId,
      action: "convert",
      userId: actor?.id || "system",
      branchId: converted?.franchiseId,
      oldValue: existing,
      newValue: converted,
    });

    if (newType === "Invoice" && converted?.phone) {
      await notifyCustomer(converted.phone, null, "Invoice Generated", `Your invoice ${newId} for ${converted.vehicle} has been generated.`);
    }

    return converted;
  }

  async cancelInvoice(id: string, reason: string, actor?: BillingActor) {
    const scope = resolveDataScope(actor);
    const existing = await this.repository.findById(id, scopeWhere(scope));
    if (!existing) throw new NotFoundError("Invoice not found");

    // A paid invoice cannot be cancelled — payment has already been received
    if (existing.status === "Paid" || existing.status === "Partially Paid") {
      throw new ValidationError(
        `Cannot cancel an invoice with status "${existing.status}". ` +
        `Payment has already been recorded against this invoice.`
      );
    }

    const cancelled = await this.repository.cancel(id, reason, actor?.id);

    await logAudit({
      module: "billing",
      recordId: id,
      action: "cancel",
      userId: actor?.id || "system",
      branchId: cancelled.franchiseId,
      oldValue: existing,
      newValue: cancelled,
    });

    return cancelled;
  }

  async shareInvoice(id: string, channel: "whatsapp" | "email", actor?: BillingActor) {
    const scope = resolveDataScope(actor);
    const invoice = await this.repository.findById(id, scopeWhere(scope));
    if (!invoice) throw new NotFoundError("Invoice not found");

    await logAudit({
      module: "billing",
      recordId: id,
      action: "share",
      userId: actor?.id || "system",
      branchId: invoice.franchiseId,
      newValue: { channel },
    });

    const message = `Your invoice ${invoice.id} for ${invoice.vehicle} — total ₹${(invoice.amount + invoice.gst - invoice.discount).toFixed(2)}.`;
    if (channel === "whatsapp") {
      await notifyCustomer(invoice.phone, null, "Invoice Shared", message);
    } else {
      await notifyCustomer(null, invoice.client, "Invoice Shared", message);
    }

    return { success: true };
  }

  // Step 3 Item #1 — permanent deletion is an exceptional operation, not an
  // ordinary business action. Locked policy: SUPER_ADMIN only, invoice must
  // already be Cancelled (via the existing cancelInvoice flow, which itself
  // requires a reason and blocks Paid/Partially-Paid invoices), zero linked
  // payments (never cascade-delete payment history), mandatory purge reason,
  // and a full pre-delete audit snapshot written atomically with the delete —
  // if either half fails, neither happens, so the audit trail can never claim
  // a deletion that didn't occur.
  async deleteInvoice(id: string, reason: string, actor?: BillingActor) {
    if (actor?.role !== "SUPER_ADMIN") {
      throw new ForbiddenError("Only a Super Administrator may permanently delete an invoice.");
    }
    if (!reason || !reason.trim()) {
      throw new ValidationError("A reason is required to permanently delete an invoice.");
    }

    const scope = resolveDataScope(actor);
    const existing = await this.repository.findById(id, scopeWhere(scope));
    if (!existing) throw new NotFoundError("Invoice not found");

    if (existing.status !== "Cancelled") {
      throw new ValidationError(
        `Only a Cancelled invoice may be permanently deleted (current status: "${existing.status}"). Cancel it first.`
      );
    }

    const linkedPaymentCount = await this.repository.countActivePaymentsForInvoice(id);
    if (linkedPaymentCount > 0) {
      throw new ValidationError(
        `Cannot permanently delete invoice ${id}: ${linkedPaymentCount} payment record(s) are still linked to it. Payments are never removed as a side effect of invoice deletion.`
      );
    }

    const deleted = await db.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          module: "billing",
          recordId: id,
          action: "permanent_delete",
          userId: actor?.id || "unknown",
          branchId: existing.franchiseId,
          oldValue: JSON.parse(JSON.stringify(existing)),
          newValue: { reason },
        },
      });

      // 13.12: release the sequence number only if this was the most recently issued
      // invoice for its prefix — otherwise the gap stays open, matching the spec example.
      if (existing.numberPrefix && existing.sequenceNumber != null) {
        await tx.invoiceSequence.updateMany({
          where: { prefix: existing.numberPrefix, counter: existing.sequenceNumber },
          data: { counter: { decrement: 1 } },
        });
      }

      // See hardDeleteInvoice's comment for why this isn't a soft delete.
      return tx.invoice.delete({ where: { id } });
    });

    return deleted;
  }
}
