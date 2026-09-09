import { z } from 'zod';

export const createInventorySchema = z.object({
  body: z.object({
    name: z.string().min(1, "Item name is required"),
    unit: z.string().optional(),
    category: z.string().optional(),
    stock: z.union([z.string(), z.number()]).optional(),
    reorder: z.union([z.string(), z.number()]).optional(),
    cost: z.union([z.string(), z.number()]).optional(),
    supplier: z.string().optional(),
    location: z.string().optional(),
  })
});

// INV-04 — `stock` deliberately excluded. Once InventoryAdjustmentService's
// request/approve workflow shipped and was tested, this became the only
// remaining unmediated path to change stock directly (no reason required,
// no approval, no re-validation against current stock) — removed so there
// is exactly one way to change an item's stock quantity, not two.
export const updateInventorySchema = z.object({
  body: z.object({
    name: z.string().optional(),
    unit: z.string().optional(),
    category: z.string().optional(),
    reorder: z.union([z.string(), z.number()]).optional(),
    cost: z.union([z.string(), z.number()]).optional(),
    supplier: z.string().optional(),
    location: z.string().optional(),
  })
});

export type CreateInventoryDTO = z.infer<typeof createInventorySchema>['body'];
export type UpdateInventoryDTO = z.infer<typeof updateInventorySchema>['body'];

// INV-05 — `status` deliberately excluded. It was previously a
// client-supplied optional field with no validation at all, letting a
// caller create a request already "Dispatched"/"Received" and bypass HQ
// review entirely. A created request is always "Submitted"; only
// approveRequest/rejectRequest (HQ-only, additionally gated) may move it
// forward.
export const createProductRequestSchema = z.object({
  body: z.object({
    itemId: z.string().min(1, "itemId is required"),
    quantityRequested: z.coerce.number().int("quantityRequested must be a whole number").positive("quantityRequested must be greater than zero"),
    requiredDate: z.string().optional(),
    priority: z.string().optional(),
    remarks: z.string().optional(),
  })
});

// quantityApproved is the sole input; the resulting status
// (Approved/Partially Approved/Rejected) is always derived from it, never
// accepted directly from the client (rule D).
export const approveProductRequestSchema = z.object({
  body: z.object({
    quantityApproved: z.coerce.number().int("quantityApproved must be a whole number").min(0, "quantityApproved cannot be negative"),
  })
});

export type CreateProductRequestDTO = z.infer<typeof createProductRequestSchema>['body'];
export type ApproveProductRequestDTO = z.infer<typeof approveProductRequestSchema>['body'];
