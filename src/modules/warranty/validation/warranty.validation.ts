import { z } from 'zod';

// WTY-01C (D-W2, locked) — invoiceId is now mandatory at the validation
// boundary; the service layer additionally verifies the invoice actually
// qualifies (real Invoice type, not deleted/cancelled) and is in scope.
// customerId/vehicleNo are intentionally NOT accepted here — they are
// always derived from the invoice, never trusted from the client.
export const createWarrantySchema = z.object({
  body: z.object({
    invoiceId: z.string().min(1, "invoiceId is required"),
    jobId: z.string().optional(),
    itemName: z.string().min(1, "Item/service name is required"),
    durationDays: z.coerce.number().int("durationDays must be a whole number").positive("durationDays must be greater than zero"),
    startDate: z.string().optional(),
    expiryDate: z.string().optional(),
    notes: z.string().optional(),
  })
});
