import { PaymentsRepository } from '../repository/payments.repository.js';
import type { CreatePaymentDTO } from '../validation/payments.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';

import { db } from '../../../lib/db.js';

export class PaymentsService {
  constructor(private readonly repository: PaymentsRepository = new PaymentsRepository()) {}

  async getAllPayments() {
    const list = await this.repository.findAll();
    const invoices = await db.invoice.findMany({ where: { isDeleted: false } });
    const jobs = await db.job.findMany({ where: { isDeleted: false } });

    const invMap = new Map(invoices.map((i) => [i.id, i]));
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    return list.map((p) => {
      const inv = p.invoiceId ? invMap.get(p.invoiceId) : null;
      const job = p.jobId ? jobMap.get(p.jobId) : null;
      const vehicle = inv?.vehicle && inv.vehicle !== "-" ? inv.vehicle : job?.vehicle && job.vehicle !== "-" ? job.vehicle : "—";
      const model = (inv as any)?.model || (inv as any)?.makeModel || (job as any)?.model || "";
      const phone = (inv as any)?.phone || (job as any)?.phone || "";
      const client = inv?.client || job?.customer || p.client || "Walk-in Customer";
      return {
        ...p,
        vehicle,
        model,
        phone,
        client,
      };
    });
  }

  async getPaymentsByCustomer(customerId: string) {
    return this.repository.findPaymentsByCustomerId(customerId);
  }

  async createPayment(data: CreatePaymentDTO) {
    let clientName = data.client || "Walk-in Customer";
    let invoiceTotal = 0;
    let currentTotalPaid = 0;

    if (data.invoiceId) {
      try {
        const invoice = await this.repository.findInvoiceById(data.invoiceId);
        if (invoice) {
          // Payments are only allowed on Invoices, not on Estimates or Quotations
          if (invoice.type === 'Estimate' || invoice.type === 'Quotation') {
            throw new ValidationError(
              `Payments cannot be recorded against an ${invoice.type}. Please convert it to an Invoice first.`
            );
          }
          clientName = invoice.client || clientName;
          invoiceTotal = (invoice.amount || 0) + (invoice.gst || 0) - (invoice.discount || 0);

          const existingPays = await this.repository.findPaymentsByInvoiceId(data.invoiceId);
          currentTotalPaid = (existingPays || []).reduce((sum, p) => sum + p.amount, 0);
        }
      } catch (err) {
        // Re-throw business rule violations; only swallow unexpected DB lookup errors
        if (err instanceof ValidationError) throw err;
        console.error("Invoice lookup non-fatal error:", err);
      }
    } else if (data.jobId) {
      try {
        const job = await this.repository.findJobById(data.jobId);
        if (job) {
          clientName = job.customer || clientName;
        }
      } catch (err) {
        console.error("Job lookup non-fatal error:", err);
      }
    } else if (data.customerId) {
      try {
        const customer = await this.repository.findCustomerById(data.customerId);
        if (customer) {
          clientName = customer.name || clientName;
        }
      } catch (err) {
        console.error("Customer lookup non-fatal error:", err);
      }
    }

    if (!data.amount || Number(data.amount) <= 0) {
      throw new ValidationError("Payment amount must be greater than 0");
    }

    // Calculate receipt number
    const prefix = "RCPT-25-26-";
    let receiptNumber: string;
    try {
      receiptNumber = await this.repository.getNextReceiptNumber(prefix);
    } catch {
      receiptNumber = `${prefix}${Date.now().toString().slice(-4)}`;
    }

    const payId = generateUid("PAY");
    const amount = Number(data.amount || 0);

    // Calculate outstanding balance after payment if linked to invoice
    let outstandingBalance: number | undefined;
    if (data.invoiceId && invoiceTotal > 0) {
      outstandingBalance = Math.max(0, invoiceTotal - (currentTotalPaid + amount));
    }

    const newPayment = await this.repository.create(
      payId,
      data,
      clientName,
      receiptNumber,
      outstandingBalance
    );

    // Update invoice status if linked to invoice
    if (data.invoiceId) {
      try {
        const newTotalPaid = currentTotalPaid + amount;
        if (invoiceTotal > 0 && newTotalPaid >= invoiceTotal) {
          await this.repository.updateInvoiceStatus(data.invoiceId, "Paid");
        } else if (newTotalPaid > 0) {
          await this.repository.updateInvoiceStatus(data.invoiceId, "Partially Paid");
        }
      } catch (err) {
        console.error("Failed to update invoice status:", err);
      }
    }

    // Update customer spend
    if (clientName) {
      try {
        const cust = await this.repository.findCustomerByPhone(data.ref || "");
        if (cust) {
          await this.repository.incrementCustomerSpend(cust.id, amount);
        }
      } catch (err) {
        console.error("Failed to update customer spend:", err);
      }
    }

    return newPayment;
  }

  async createRefund(data: {
    originalPaymentId: string;
    amount: number;
    reason: string;
    approvedBy: string;
  }) {
    const allPays = await this.repository.findAll();
    const original = allPays.find((p) => p.id === data.originalPaymentId);
    if (!original) {
      throw new NotFoundError("Original payment not found");
    }

    const prefix = "RCPT-25-26-";
    let receiptNumber: string;
    try {
      receiptNumber = await this.repository.getNextReceiptNumber(prefix);
    } catch {
      receiptNumber = `${prefix}${Date.now().toString().slice(-4)}`;
    }
    const payId = generateUid("RFND");

    const refundPayment = await this.repository.create(
      payId,
      {
        invoiceId: original.invoiceId || undefined,
        jobId: original.jobId || undefined,
        customerId: original.customerId || undefined,
        amount: -Math.abs(data.amount),
        mode: original.mode,
        type: "Refund",
        refundReason: data.reason,
        originalReceiptRef: original.receiptNumber || original.id,
        approvedBy: data.approvedBy,
        notes: `Refund for ${original.receiptNumber || original.id}: ${data.reason}`,
      },
      original.client,
      receiptNumber,
      undefined
    );

    // If linked to invoice, revert invoice status if no longer fully paid
    if (original.invoiceId) {
      try {
        const existingPays = await this.repository.findPaymentsByInvoiceId(original.invoiceId);
        const totalPaid = existingPays.reduce((sum, p) => sum + p.amount, 0);
        const invoice = await this.repository.findInvoiceById(original.invoiceId);
        if (invoice) {
          const invoiceTotal = invoice.amount + invoice.gst - invoice.discount;
          if (totalPaid < invoiceTotal) {
            await this.repository.updateInvoiceStatus(original.invoiceId, "Partially Paid");
          }
        }
      } catch (err) {
        console.error("Failed to revert invoice status:", err);
      }
    }

    return refundPayment;
  }

  async deletePayment(id: string) {
    return this.repository.softDelete(id);
  }
}
