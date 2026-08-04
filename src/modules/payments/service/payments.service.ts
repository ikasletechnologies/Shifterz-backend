import { PaymentsRepository } from '../repository/payments.repository.js';
import type { CreatePaymentDTO } from '../validation/payments.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';

export class PaymentsService {
  constructor(private readonly repository: PaymentsRepository = new PaymentsRepository()) {}

  async getAllPayments() {
    return this.repository.findAll();
  }

  async getPaymentsByCustomer(customerId: string) {
    return this.repository.findPaymentsByCustomerId(customerId);
  }

  async createPayment(data: CreatePaymentDTO) {
    let clientName = "Walk-in Customer";
    let invoiceTotal = 0;
    let currentTotalPaid = 0;

    if (data.invoiceId) {
      const invoice = await this.repository.findInvoiceById(data.invoiceId);
      if (!invoice) {
        throw new NotFoundError("Invoice not found");
      }
      clientName = invoice.client;
      invoiceTotal = invoice.amount + invoice.gst - invoice.discount;

      const existingPays = await this.repository.findPaymentsByInvoiceId(data.invoiceId);
      currentTotalPaid = existingPays.reduce((sum, p) => sum + p.amount, 0);
    } else if (data.jobId) {
      const job = await this.repository.findJobById(data.jobId);
      if (!job) {
        throw new NotFoundError("Job not found");
      }
      clientName = job.customer;
    } else if (data.customerId) {
      const customer = await this.repository.findCustomerById(data.customerId);
      if (!customer) {
        throw new NotFoundError("Customer not found");
      }
      clientName = customer.name;
    } else {
      throw new ValidationError("Payment must be linked to an Invoice, Job Card, or Customer.");
    }

    // Calculate receipt number
    const prefix = "RCPT-25-26-";
    const receiptNumber = await this.repository.getNextReceiptNumber(prefix);

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
      const newTotalPaid = currentTotalPaid + amount;
      if (newTotalPaid >= invoiceTotal) {
        await this.repository.updateInvoiceStatus(data.invoiceId, "Paid");
      } else if (newTotalPaid > 0) {
        await this.repository.updateInvoiceStatus(data.invoiceId, "Partially Paid");
      }
    }

    // Update customer spend
    if (clientName) {
      const cust = await this.repository.findCustomerByPhone(data.ref || "");
      if (cust) {
        await this.repository.incrementCustomerSpend(cust.id, amount);
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
    const receiptNumber = await this.repository.getNextReceiptNumber(prefix);
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
      const existingPays = await this.repository.findPaymentsByInvoiceId(original.invoiceId);
      const totalPaid = existingPays.reduce((sum, p) => sum + p.amount, 0);
      const invoice = await this.repository.findInvoiceById(original.invoiceId);
      if (invoice) {
        const invoiceTotal = invoice.amount + invoice.gst - invoice.discount;
        if (totalPaid < invoiceTotal) {
          await this.repository.updateInvoiceStatus(original.invoiceId, "Partially Paid");
        }
      }
    }

    return refundPayment;
  }

  async deletePayment(id: string) {
    return this.repository.softDelete(id);
  }
}
