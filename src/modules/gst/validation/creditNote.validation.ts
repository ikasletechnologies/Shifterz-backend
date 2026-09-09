import { z } from 'zod';

const creditNoteLineSchema = z.object({
  description: z.string().min(1, "Line description is required"),
  hsnSac: z.string().optional().nullable(),
  quantity: z.coerce.number().positive().optional().default(1),
  rate: z.coerce.number().min(0, "Rate cannot be negative"),
  gstRate: z.coerce.number().min(0, "GST rate cannot be negative"),
  cessRate: z.coerce.number().min(0).optional(),
});

export const createCreditNoteSchema = z.object({
  body: z.object({
    originalInvoiceId: z.string().min(1, "Original invoice id is required"),
    reason: z.string().min(1, "A reason is required to issue a credit note"),
    customerId: z.string().optional().nullable(),
    lines: z.array(creditNoteLineSchema).min(1, "At least one line item is required"),
  })
});

export const cancelCreditNoteSchema = z.object({
  body: z.object({
    reason: z.string().min(1, "A reason is required to cancel a credit note"),
  })
});

export type CreateCreditNoteDTO = z.infer<typeof createCreditNoteSchema>['body'];
export type CancelCreditNoteDTO = z.infer<typeof cancelCreditNoteSchema>['body'];
