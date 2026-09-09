import { z } from 'zod';

export const createAdjustmentSchema = z.object({
  body: z.object({
    itemId: z.string().min(1, "itemId is required"),
    requestedQty: z.coerce.number().int("requestedQty must be a whole number").refine((n) => n !== 0, "requestedQty must not be zero"),
    reason: z.string().trim().min(1, "A reason is required to request a stock adjustment"),
  })
});

export const rejectAdjustmentSchema = z.object({
  body: z.object({
    rejectionNote: z.string().trim().min(1, "A rejection note is required"),
  })
});

export type CreateAdjustmentDTO = z.infer<typeof createAdjustmentSchema>['body'];
export type RejectAdjustmentDTO = z.infer<typeof rejectAdjustmentSchema>['body'];
