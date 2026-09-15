const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/modules/payments/service/payments.service.ts');
let code = fs.readFileSync(filePath, 'utf-8');

// 1. Rewrite createPayment
code = code.replace(
  /async createPayment\(data: CreatePaymentDTO, scope: DataScope\) \{([\s\S]*?)return newPayment;\n  \}/,
  `async createPayment(data: CreatePaymentDTO, scope: DataScope) {
    try {
      return await db.$transaction(async (tx) => {
        let clientName = data.client || "Walk-in Customer";
        let invoiceTotal = 0;
        let currentTotalPaid = 0;
        let franchiseId: string | null = scope.unrestricted ? null : scope.franchiseId;

        if (data.invoiceId) {
          const invoice = await this.repository.findInvoiceById(data.invoiceId);
          if (invoice) {
            if (!scope.unrestricted && (invoice.franchiseId ?? null) !== scope.franchiseId) {
              throw new NotFoundError("Invoice not found");
            }
            if (invoice.type === 'Estimate' || invoice.type === 'Quotation') {
              throw new ValidationError(
                \`Payments cannot be recorded against an \${invoice.type}. Please convert it to an Invoice first.\`
              );
            }
            clientName = invoice.client || clientName;
            invoiceTotal = (invoice.amount || 0) + (invoice.gst || 0) - (invoice.discount || 0);
            franchiseId = invoice.franchiseId ?? null;

            const existingPays = await this.repository.findPaymentsByInvoiceId(data.invoiceId);
            currentTotalPaid = (existingPays || []).reduce((sum, p) => sum + p.amount, 0);
          }
        } else if (data.jobId) {
          const job = await this.repository.findJobById(data.jobId);
          if (job) {
            if (!scope.unrestricted && (job.franchiseId ?? null) !== scope.franchiseId) {
              throw new NotFoundError("Job not found");
            }
            clientName = job.customer || clientName;
            franchiseId = job.franchiseId ?? null;
          }
        } else if (data.customerId) {
          const customer = await this.repository.findCustomerById(data.customerId);
          if (customer) {
            if (!scope.unrestricted && (customer.franchiseId ?? null) !== scope.franchiseId) {
              throw new NotFoundError("Customer not found");
            }
            clientName = customer.name || clientName;
            franchiseId = customer.franchiseId ?? null;
          }
        }

        if (!data.amount || Number(data.amount) <= 0) {
          throw new ValidationError("Payment amount must be greater than 0");
        }

        const prefix = "RCPT-25-26-";
        let receiptNumber: string;
        try {
          receiptNumber = await this.repository.getNextReceiptNumber(prefix);
        } catch {
          receiptNumber = \`\${prefix}\${Date.now().toString().slice(-4)}\`;
        }

        const payId = generateUid("PAY");
        const amount = Number(data.amount || 0);

        let outstandingBalance: number | undefined;
        if (data.invoiceId && invoiceTotal > 0) {
          outstandingBalance = Math.max(0, invoiceTotal - (currentTotalPaid + amount));
        }

        const newPayment = await this.repository.create(
          payId,
          data,
          clientName,
          receiptNumber,
          franchiseId,
          outstandingBalance,
          data.idempotencyKey,
          tx
        );

        if (data.invoiceId) {
          const newTotalPaid = currentTotalPaid + amount;
          if (invoiceTotal > 0 && newTotalPaid >= invoiceTotal) {
            await this.repository.updateInvoiceStatus(data.invoiceId, "Paid", tx);
          } else if (newTotalPaid > 0) {
            await this.repository.updateInvoiceStatus(data.invoiceId, "Partially Paid", tx);
          }
        }

        if (clientName) {
          const cust = await this.repository.findCustomerByPhone(data.ref || "");
          if (cust) {
            await this.repository.incrementCustomerSpend(cust.id, amount, tx);
          }
        }

        return newPayment;
      });
    } catch (err: any) {
      if (err.code === 'P2002' && err.meta?.target?.includes('idempotencyKey')) {
        throw new ValidationError("Duplicate request detected");
      }
      throw err;
    }
  }`
);

// 2. Rewrite createRefund
code = code.replace(
  /async createRefund\(data: \{([\s\S]*?)return refundPayment;\n  \}/,
  `async createRefund(data: {
    originalPaymentId: string;
    amount: number;
    reason: string;
    approvedBy: string;
    idempotencyKey?: string;
  }, scope: DataScope) {
    try {
      return await db.$transaction(async (tx) => {
        const original = await this.repository.findById(data.originalPaymentId, scopeWhere(scope));
        if (!original) {
          throw new NotFoundError("Original payment not found");
        }

        const prefix = "RCPT-25-26-";
        let receiptNumber: string;
        try {
          receiptNumber = await this.repository.getNextReceiptNumber(prefix);
        } catch {
          receiptNumber = \`\${prefix}\${Date.now().toString().slice(-4)}\`;
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
            notes: \`Refund for \${original.receiptNumber || original.id}: \${data.reason}\`,
          },
          original.client,
          receiptNumber,
          original.franchiseId ?? null,
          undefined,
          data.idempotencyKey,
          tx
        );

        if (original.invoiceId) {
          const existingPays = await this.repository.findPaymentsByInvoiceId(original.invoiceId);
          const totalPaid = existingPays.reduce((sum, p) => sum + p.amount, 0);
          const invoice = await this.repository.findInvoiceById(original.invoiceId);
          if (invoice) {
            const invoiceTotal = invoice.amount + invoice.gst - invoice.discount;
            if (totalPaid < invoiceTotal) {
              await this.repository.updateInvoiceStatus(original.invoiceId, "Partially Paid", tx);
            }
          }
        }

        return refundPayment;
      });
    } catch (err: any) {
      if (err.code === 'P2002' && err.meta?.target?.includes('idempotencyKey')) {
        throw new ValidationError("Duplicate request detected");
      }
      throw err;
    }
  }`
);

fs.writeFileSync(filePath, code);
console.log("Updated payments.service.ts");
