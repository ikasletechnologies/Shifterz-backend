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
    let clientName = data.client || "Walk-in Customer";
    let invoiceTotal = 0;
    let currentTotalPaid = 0;

    if (data.invoiceId) {
      try {
        const invoice = await this.repository.findInvoiceById(data.invoiceId);
        if (invoice) {
          clientName = invoice.client || clientName;
          invoiceTotal = (invoice.amount || 0) + (invoice.gst || 0) - (invoice.discount || 0);

          const existingPays = await this.repository.findPaymentsByInvoiceId(data.invoiceId);
          currentTotalPaid = (existingPays || []).reduce((sum, p) => sum + p.amount, 0);
        }
      } catch (err) {
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
          
          try {
            const invoice = await this.repository.findInvoiceById(data.invoiceId);
            if (invoice && invoice.vehicle) {
              const { OutpassService } = await import('../../outpass/service/outpass.service.js');
              const outpassService = new OutpassService();
              
              await outpassService.createOutpass({
                vehicle: invoice.vehicle,
                customer: invoice.client || "",
                phone: invoice.phone || "",
                service: invoice.service || "",
                jobCardId: invoice.jobId || undefined,
                invoiceId: invoice.id,
                customerConfirmation: true,
                outTime: new Date().toISOString()
              }, null, data.createdBy || undefined);
            }
          } catch (outpassErr) {
            console.error("Failed to auto-generate outpass:", outpassErr);
          }
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
