import { db } from '../../../lib/db.js';
import type { CreateInvoiceDTO } from '../validation/billing.validation.js';
import type { GstCalculationResult } from '../../gst/service/gstCalculation.service.js';
import type { Prisma } from '@prisma/client';

type FranchiseScopeWhere = { franchiseId?: string | null };

export class BillingRepository {
  async findAll(franchiseId?: string | null) {
    return db.invoice.findMany({
      where: { isDeleted: false, ...(franchiseId ? { franchiseId } : {}) },
      orderBy: { date: "desc" },
    });
  }

  async findAllPayments() {
    return db.payment.findMany();
  }

  // Atomically allocates the next sequence number for a prefix (e.g. "STZ-25-26-").
  // Postgres upsert compiles to INSERT ... ON CONFLICT DO UPDATE, which is what
  // actually makes this race-safe under concurrent invoice creation.
  async allocateSequence(prefix: string): Promise<number> {
    const seq = await db.invoiceSequence.upsert({
      where: { prefix },
      create: { prefix, counter: 1 },
      update: { counter: { increment: 1 } },
    });
    return seq.counter;
  }

  // 13.12: only steps the counter back if the deleted invoice was the most recently
  // issued one for this prefix (conditional update — matches nothing otherwise, so a
  // gap left by deleting a non-last invoice is preserved, not reused).
  async releaseSequenceIfLast(prefix: string, number: number): Promise<void> {
    await db.invoiceSequence.updateMany({
      where: { prefix, counter: number },
      data: { counter: { decrement: 1 } },
    });
  }

  // GST-03 — when `gstResult` is supplied (always, for type==='Invoice'; never
  // for Quotation/Estimate, which aren't tax documents), it is authoritative
  // for amount/gst/gstNumber: the backend-computed snapshot, not whatever the
  // client sent. `data.amount`/`data.gst`/`data.gstNumber` are only used
  // as-is when `gstResult` is absent, preserving today's behavior for
  // non-Invoice document types.
  // GST-05A — optional tx lets the caller fold this write into the same
  // transaction as the GstTransaction ledger rows for the same invoice.
  async create(id: string, prefix: string, sequenceNumber: number, data: CreateInvoiceDTO, gstResult?: GstCalculationResult, tx?: Prisma.TransactionClient) {
    const client = tx ?? db;
    return client.invoice.create({
      data: {
        id,
        numberPrefix: prefix,
        sequenceNumber,
        type: data.type,
        client: data.client,
        phone: data.phone || "",
        vehicle: data.vehicle || "",
        service: data.service || "",
        amount: gstResult ? gstResult.taxableAmount : Number(data.amount || 0),
        gst: gstResult ? gstResult.totalTax : Number(data.gst || 0),
        discount: Number(data.discount || 0),
        status: data.status || "Pending",
        date: data.date ? new Date(data.date) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : new Date(),
        notes: data.notes || "",
        gstNumber: gstResult ? gstResult.meta.buyerGstin : (data.gstNumber || null),
        items: data.items ? data.items : null,
        bankDetails: data.bankDetails || null,
        paymentTerms: data.paymentTerms || null,
        deliveryTerms: data.deliveryTerms || null,
        authorizedSignatory: data.authorizedSignatory || null,
        warranty: data.warranty || null,
        discountReason: data.discountReason || null,
        franchiseId: data.franchiseId || null,
        jobId: data.jobId || null,
        createdBy: data.createdBy || null,
        approvedBy: data.status === "Approved" ? data.createdBy : null,
        ...(gstResult ? {
          sellerGstin: gstResult.meta.sellerGstin,
          sellerState: gstResult.meta.sellerState,
          buyerState: gstResult.meta.buyerState,
          placeOfSupply: gstResult.placeOfSupply,
          supplyType: gstResult.supplyType,
          taxableAmount: gstResult.taxableAmount,
          cgst: gstResult.cgst,
          sgst: gstResult.sgst,
          igst: gstResult.igst,
          cess: gstResult.cess,
          hsnSac: gstResult.lines.length === 1 ? gstResult.lines[0]?.hsnSac ?? null : null,
          gstCalculationMeta: JSON.parse(JSON.stringify(gstResult)),
        } : {}),
      },
    });
  }

  async findById(id: string, scopeWhere: FranchiseScopeWhere = {}) {
    return db.invoice.findFirst({ where: { id, ...scopeWhere } });
  }

  async update(id: string, data: Record<string, any>) {
    return db.invoice.update({
      where: { id },
      data,
    });
  }

  async cancel(id: string, reason: string, cancelledBy?: string | null) {
    return db.invoice.update({
      where: { id },
      data: { status: "Cancelled", cancelReason: reason, cancelledBy: cancelledBy || null },
    });
  }

  // Step 3 Item #1 — payments are never cascade-deleted alongside an invoice.
  // Used to block permanent deletion, not to clear the way for it.
  async countActivePaymentsForInvoice(invoiceId: string): Promise<number> {
    return db.payment.count({ where: { invoiceId, isDeleted: false } });
  }

  // Genuine removal, not soft delete: `id` doubles as the human-readable invoice
  // number, and 13.12 requires that number actually become reusable — a soft-deleted
  // row would still hold the primary key and collide when the number is reissued.
  // The pre-delete snapshot in the audit log (see billing.service.ts) is the record
  // of the deletion, not a surviving row. Restricted to SUPER_ADMIN, cancelled-only,
  // zero-linked-payments-only — see billing.service.ts:deleteInvoice.
  async hardDeleteInvoice(id: string) {
    return db.invoice.delete({ where: { id } });
  }
}
