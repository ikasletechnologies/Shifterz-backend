import { db } from '../../../lib/db.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { resolveDataScope, assertWithinScope } from '../../../shared/scope/dataScope.js';
import { logAudit } from '../../../shared/services/audit.service.js';
import { GstCalculationService } from './gstCalculation.service.js';
import { GstTransactionLedgerService } from './gstTransactionLedger.service.js';
import { assertIssuerAuthority, currentFyPrefix, type NoteActor } from './noteAuthority.helper.js';
import type { CreateCreditNoteDTO } from '../validation/creditNote.validation.js';

export type { NoteActor };

export class GstCreditNoteService {
  private readonly calcEngine = new GstCalculationService();
  private readonly ledger = new GstTransactionLedgerService();

  // Phase B — original invoice validation, franchise scope, GST calculation
  // via the existing engine (never client-supplied tax figures), atomic
  // note + lines + ledger write.
  async create(input: CreateCreditNoteDTO, actor?: NoteActor) {
    assertIssuerAuthority(actor, 'credit notes');

    const invoice = await db.invoice.findFirst({ where: { id: input.originalInvoiceId, isDeleted: false } });
    if (!invoice) throw new NotFoundError('Original invoice not found.');

    assertWithinScope(resolveDataScope(actor), invoice.franchiseId, 'Original invoice not found.');

    if (invoice.type !== 'Invoice') {
      throw new ValidationError('A credit note can only be issued against a tax Invoice, not a Quotation or Estimate.');
    }
    if (invoice.status === 'Cancelled') {
      throw new ValidationError('Cannot issue a credit note against a cancelled invoice.');
    }
    // Preserve B2B/B2C, place of supply, and seller/buyer identity exactly as
    // they were at invoice-issuance time — re-resolving current
    // Franchise/Customer state here would let a credit note disagree with the
    // invoice it corrects if either record changed since.
    if (!invoice.sellerState || !invoice.placeOfSupply) {
      throw new ValidationError('This invoice has no GST snapshot (pre-GST-03 legacy invoice) — credit notes are not supported against it.');
    }

    const gstResult = this.calcEngine.calculate({
      sellerGstin: invoice.sellerGstin,
      sellerState: invoice.sellerState,
      buyerGstin: invoice.gstNumber,
      buyerState: invoice.buyerState,
      placeOfSupply: invoice.placeOfSupply,
      lineItems: input.lines.map((l) => ({
        description: l.description,
        unitPrice: l.rate,
        quantity: l.quantity ?? 1,
        hsnSac: l.hsnSac ?? null,
        gstRate: l.gstRate,
        cessRate: l.cessRate,
      })),
    });

    const date = new Date();
    const prefix = currentFyPrefix('CN', date);
    const seq = await db.invoiceSequence.upsert({
      where: { prefix },
      create: { prefix, counter: 1 },
      update: { counter: { increment: 1 } },
    });
    const number = `${prefix}${seq.counter}`;

    const note = await db.$transaction(async (tx) => {
      const created = await tx.creditNote.create({
        data: {
          number,
          date,
          franchiseId: invoice.franchiseId,
          originalInvoiceId: invoice.id,
          customerId: input.customerId ?? null,
          reason: input.reason,
          taxableAmount: gstResult.taxableAmount,
          cgst: gstResult.cgst,
          sgst: gstResult.sgst,
          igst: gstResult.igst,
          cess: gstResult.cess,
          totalTax: gstResult.totalTax,
          totalAmount: gstResult.grandTotal,
          status: 'Issued',
          createdBy: actor?.id ?? null,
        },
      });

      await tx.creditNoteLine.createMany({
        data: gstResult.lines.map((line, i) => ({
          creditNoteId: created.id,
          description: input.lines[i]?.description ?? line.description ?? '',
          hsnSac: line.hsnSac,
          quantity: input.lines[i]?.quantity ?? 1,
          rate: input.lines[i]?.rate ?? 0,
          taxableAmount: line.taxableAmount,
          gstRate: line.gstRate,
          cgst: line.cgst,
          sgst: line.sgst,
          igst: line.igst,
          cess: line.cess,
          lineTotal: line.lineTotal,
        })),
      });

      for (const line of gstResult.lines) {
        await this.ledger.record({
          franchiseId: invoice.franchiseId,
          documentType: 'CREDIT_NOTE',
          documentId: created.id,
          documentNumber: created.number,
          documentDate: created.date,
          sellerGstin: gstResult.meta.sellerGstin,
          buyerGstin: gstResult.meta.buyerGstin,
          buyerName: invoice.client,
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

      return created;
    });

    await logAudit({
      module: 'GST Credit Note',
      recordId: note.id,
      action: 'CREATE',
      userId: actor?.id || 'unknown',
      branchId: invoice.franchiseId,
      oldValue: null,
      newValue: note,
    });

    return note;
  }

  async findById(id: string, actor?: NoteActor) {
    const note = await db.creditNote.findUnique({ where: { id }, include: { lines: true } });
    if (!note) throw new NotFoundError('Credit note not found.');
    assertWithinScope(resolveDataScope(actor), note.franchiseId, 'Credit note not found.');
    return note;
  }

  // Statutory document — never hard-deleted. Cancellation flips status
  // only; the row (and its GstTransaction rows) remain for audit history.
  // GST reports exclude cancelled notes via a live status cross-check at
  // report time (mirrors how cancelled invoices are already excluded from
  // GSTR-1/summary reports), not by mutating the ledger rows themselves.
  async cancel(id: string, reason: string, actor?: NoteActor) {
    assertIssuerAuthority(actor, 'credit notes');

    const existing = await db.creditNote.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Credit note not found.');
    assertWithinScope(resolveDataScope(actor), existing.franchiseId, 'Credit note not found.');

    if (!reason || !reason.trim()) {
      throw new ValidationError('A reason is required to cancel a credit note.');
    }
    if (existing.status === 'Cancelled') {
      throw new ValidationError('This credit note is already cancelled.');
    }

    const cancelled = await db.creditNote.update({
      where: { id },
      data: { status: 'Cancelled' },
    });

    await logAudit({
      module: 'GST Credit Note',
      recordId: id,
      action: 'CANCEL',
      userId: actor?.id || 'unknown',
      branchId: existing.franchiseId,
      oldValue: existing,
      newValue: { ...cancelled, cancelReason: reason },
    });

    return cancelled;
  }
}
