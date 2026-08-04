import { db } from '../../../lib/db.js';
import type { CreatePaymentDTO } from '../validation/payments.validation.js';

export class PaymentsRepository {
  async findAll() {
    return db.payment.findMany({
      where: { isDeleted: false },
      orderBy: { date: "desc" },
    });
  }

  async findInvoiceById(id: string) {
    return db.invoice.findUnique({ where: { id } });
  }

  async findJobById(id: string) {
    return db.job.findUnique({ where: { id } });
  }

  async findCustomerById(id: string) {
    return db.customer.findUnique({ where: { id } });
  }

  async getNextReceiptNumber(prefix: string): Promise<string> {
    const seq = await db.receiptSequence.upsert({
      where: { prefix },
      create: { prefix, counter: 1 },
      update: { counter: { increment: 1 } },
    });
    const seqStr = String(seq.counter).padStart(4, "0");
    return `${prefix}${seqStr}`;
  }

  async create(
    id: string,
    data: CreatePaymentDTO,
    clientName: string,
    receiptNumber: string,
    outstandingBalance?: number
  ) {
    return db.payment.create({
      data: {
        id,
        invoiceId: data.invoiceId || null,
        jobId: data.jobId || null,
        customerId: data.customerId || null,
        client: clientName,
        amount: Number(data.amount || 0),
        outstandingBalance: outstandingBalance ?? null,
        mode: data.mode || "UPI",
        multipleModes: data.multipleModes ? (data.multipleModes as any) : null,
        type: data.type || "Full Payment",
        receiptNumber,
        date: data.date || new Date().toISOString().slice(0, 10),
        ref: data.ref || "",
        notes: data.notes || "",
        refundReason: data.refundReason || null,
        originalReceiptRef: data.originalReceiptRef || null,
        approvedBy: data.approvedBy || null,
        createdBy: data.createdBy || null,
      },
    });
  }

  async findPaymentsByInvoiceId(invoiceId: string) {
    return db.payment.findMany({ where: { invoiceId, isDeleted: false } });
  }

  async findPaymentsByJobId(jobId: string) {
    return db.payment.findMany({ where: { jobId, isDeleted: false } });
  }

  async findPaymentsByCustomerId(customerId: string) {
    return db.payment.findMany({ where: { customerId, isDeleted: false }, orderBy: { date: "desc" } });
  }

  async updateInvoiceStatus(id: string, status: string) {
    return db.invoice.update({
      where: { id },
      data: { status },
    });
  }

  async findCustomerByPhone(phone: string) {
    return db.customer.findFirst({ where: { phone } });
  }

  async incrementCustomerSpend(id: string, amountToAdd: number) {
    const cust = await db.customer.findUnique({ where: { id } });
    if (!cust) return null;
    return db.customer.update({
      where: { id },
      data: { totalSpend: cust.totalSpend + amountToAdd },
    });
  }

  async softDelete(id: string) {
    return db.payment.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date().toISOString() },
    });
  }
}
