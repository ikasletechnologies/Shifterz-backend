import { z } from 'zod';

export const createPaymentSchema = z.object({
  body: z.object({
    invoiceId: z.string().optional(),
    jobId: z.string().optional(),
    customerId: z.string().optional(),
    type: z.string().optional(), // e.g. "Full Payment", "Advance Payment", "Refund"
    amount: z.union([z.string(), z.number()]).optional(),
    mode: z.string().optional(),
    multipleModes: z.array(z.object({
      mode: z.string(),
      amount: z.number()
    })).optional(),
    date: z.string().optional(),
    ref: z.string().optional(),
    notes: z.string().optional(),
    refundReason: z.string().optional(),
    originalReceiptRef: z.string().optional(),
    approvedBy: z.string().optional(),
    createdBy: z.string().nullable().optional(),
  })
});

export type CreatePaymentDTO = z.infer<typeof createPaymentSchema>['body'];
