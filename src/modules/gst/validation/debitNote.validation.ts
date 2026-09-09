import { z } from 'zod';

const debitNoteLineSchema = z.object({
  description: z.string().min(1, "Line description is required"),
  hsnSac: z.string().optional().nullable(),
  quantity: z.coerce.number().positive().optional().default(1),
  rate: z.coerce.number().min(0, "Rate cannot be negative"),
  gstRate: z.coerce.number().min(0, "GST rate cannot be negative"),
  cessRate: z.coerce.number().min(0).optional(),
});

export const createDebitNoteSchema = z.object({
  body: z.object({
    originalInvoiceId: z.string().min(1, "Original invoice id is required"),
    reason: z.string().min(1, "A reason is required to issue a debit note"),
    customerId: z.string().optional().nullable(),
    lines: z.array(debitNoteLineSchema).min(1, "At least one line item is required"),
  })
});

export const cancelDebitNoteSchema = z.object({
  body: z.object({
    reason: z.string().min(1, "A reason is required to cancel a debit note"),
  })
});

export type CreateDebitNoteDTO = z.infer<typeof createDebitNoteSchema>['body'];
export type CancelDebitNoteDTO = z.infer<typeof cancelDebitNoteSchema>['body'];
