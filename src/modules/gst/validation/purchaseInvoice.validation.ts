import { z } from 'zod';

const purchaseInvoiceLineSchema = z.object({
  description: z.string().min(1, "Line description is required"),
  sku: z.string().optional().nullable(),
  hsnSac: z.string().optional().nullable(),
  quantity: z.coerce.number().positive().optional().default(1),
  rate: z.coerce.number().min(0, "Rate cannot be negative"),
  gstRate: z.coerce.number().min(0, "GST rate cannot be negative"),
  cessRate: z.coerce.number().min(0).optional(),
  // Per-line override; falls back to the invoice-level itcEligible below if
  // omitted. Always an explicit actor assertion — never auto-inferred, per
  // the locked scope of this phase.
  itcEligible: z.boolean().optional(),
});

export const attachPurchaseInvoiceSchema = z.object({
  body: z.object({
    invoiceNumber: z.string().min(1, "Purchase invoice number is required"),
    invoiceDate: z.string().optional(),
    itcEligible: z.boolean(),
    lines: z.array(purchaseInvoiceLineSchema).min(1, "At least one line item is required"),
  })
});

export type AttachPurchaseInvoiceDTO = z.infer<typeof attachPurchaseInvoiceSchema>['body'];
