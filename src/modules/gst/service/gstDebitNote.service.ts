import { db } from '../../../lib/db.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { resolveDataScope, assertWithinScope } from '../../../shared/scope/dataScope.js';
import { logAudit } from '../../../shared/services/audit.service.js';
import { GstCalculationService } from './gstCalculation.service.js';
import { GstTransactionLedgerService } from './gstTransactionLedger.service.js';
import { assertIssuerAuthority, currentFyPrefix, type NoteActor } from './noteAuthority.helper.js';
import type { CreateDebitNoteDTO } from '../validation/debitNote.validation.js';

// Mirrors GstCreditNoteService exactly — a Debit Note increases, rather than
// reduces, the original invoice's output tax liability (see how GSTR-3B
// aggregates the two with opposite signs), but its own creation/GST-
// calculation/persistence mechanics are identical, hence the parallel
// structure rather than a shared base class — matches the schema's own
// choice of two separate models over one polymorphic "Note" table.
export class GstDebitNoteService {
  private readonly calcEngine = new GstCalculationService();
  private readonly ledger = new GstTransactionLedgerService();

  async create(input: CreateDebitNoteDTO, actor?: NoteActor) {
    assertIssuerAuthority(actor, 'debit notes');

    const invoice = await db.invoice.findFirst({ where: { id: input.originalInvoiceId, isDeleted: false } });
    if (!invoice) throw new NotFoundError('Original invoice not found.');

    assertWithinScope(resolveDataScope(actor), invoice.franchiseId, 'Original invoice not found.');

    if (invoice.type !== 'Invoice') {
      throw new ValidationError('A debit note can only be issued against a tax Invoice, not a Quotation or Estimate.');
    }
    if (invoice.status === 'Cancelled') {
      throw new ValidationError('Cannot issue a debit note against a cancelled invoice.');
    }
    if (!invoice.sellerState || !invoice.placeOfSupply) {
      throw new ValidationError('This invoice has no GST snapshot (pre-GST-03 legacy invoice) — debit notes are not supported against it.');
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
    const prefix = currentFyPrefix('DN', date);
    const seq = await db.invoiceSequence.upsert({
      where: { prefix },
      create: { prefix, counter: 1 },
      update: { counter: { increment: 1 } },
    });
    const number = `${prefix}${seq.counter}`;

    const note = await db.$transaction(async (tx) => {
      const created = await tx.debitNote.create({
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

      await tx.debitNoteLine.createMany({
        data: gstResult.lines.map((line, i) => ({
          debitNoteId: created.id,
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
          documentType: 'DEBIT_NOTE',
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
      module: 'GST Debit Note',
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
    const note = await db.debitNote.findUnique({ where: { id }, include: { lines: true } });
    if (!note) throw new NotFoundError('Debit note not found.');
    assertWithinScope(resolveDataScope(actor), note.franchiseId, 'Debit note not found.');
    return note;
  }

  async cancel(id: string, reason: string, actor?: NoteActor) {
    assertIssuerAuthority(actor, 'debit notes');

    const existing = await db.debitNote.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Debit note not found.');
    assertWithinScope(resolveDataScope(actor), existing.franchiseId, 'Debit note not found.');

    if (!reason || !reason.trim()) {
      throw new ValidationError('A reason is required to cancel a debit note.');
    }
    if (existing.status === 'Cancelled') {
      throw new ValidationError('This debit note is already cancelled.');
    }

    const cancelled = await db.debitNote.update({
      where: { id },
      data: { status: 'Cancelled' },
    });

    await logAudit({
      module: 'GST Debit Note',
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
