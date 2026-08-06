import { z } from 'zod';

export const createPaymentSchema = z.object({
  body: z.object({
    invoiceId: z.string().optional().nullable(),
    jobId: z.string().optional().nullable(),
    customerId: z.string().optional().nullable(),
    client: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    vehicle: z.string().optional().nullable(),
    model: z.string().optional().nullable(),
    type: z.string().optional().nullable(),
    amount: z.union([z.string(), z.number()]).optional(),
    mode: z.string().optional().nullable(),
    multipleModes: z.array(z.object({
      mode: z.string(),
      amount: z.number()
    })).optional().nullable(),
    date: z.string().optional().nullable(),
    time: z.string().optional().nullable(),
    ref: z.string().optional().nullable(),
    receivedBy: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    refundReason: z.string().optional().nullable(),
    originalReceiptRef: z.string().optional().nullable(),
    approvedBy: z.string().optional().nullable(),
    createdBy: z.string().optional().nullable(),
  })
});

export type CreatePaymentDTO = z.infer<typeof createPaymentSchema>['body'];
