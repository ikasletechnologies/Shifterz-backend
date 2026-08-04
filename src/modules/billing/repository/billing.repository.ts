import { db } from '../../../lib/db.js';
import type { CreateInvoiceDTO } from '../validation/billing.validation.js';

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

  async create(id: string, prefix: string, sequenceNumber: number, data: CreateInvoiceDTO) {
    return db.invoice.create({
      data: {
        id,
        numberPrefix: prefix,
        sequenceNumber,
        type: data.type,
        client: data.client,
        phone: data.phone || "",
        vehicle: data.vehicle || "",
        service: data.service || "",
        amount: Number(data.amount || 0),
        gst: Number(data.gst || 0),
        discount: Number(data.discount || 0),
        status: data.status || "Pending",
        date: data.date ? new Date(data.date) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : new Date(),
        notes: data.notes || "",
        gstNumber: data.gstNumber || null,
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
      },
    });
  }

  async findById(id: string) {
    return db.invoice.findUnique({ where: { id } });
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

  async deletePaymentsByInvoiceId(invoiceId: string) {
    return db.payment.deleteMany({ where: { invoiceId } });
  }

  // Genuine removal, not soft delete: `id` doubles as the human-readable invoice
  // number, and 13.12 requires that number actually become reusable — a soft-deleted
  // row would still hold the primary key and collide when the number is reissued.
  // The pre-delete snapshot in the audit log (see billing.service.ts) is the record
  // of the deletion, not a surviving row.
  async hardDeleteInvoice(id: string) {
    return db.invoice.delete({ where: { id } });
  }
}
