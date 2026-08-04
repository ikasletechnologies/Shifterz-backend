import { z } from 'zod';

export const createReferralSchema = z.object({
  body: z.object({
    referringCustomerId: z.string().min(1, "referringCustomerId is required"),
    referringCustomer: z.string().min(1, "referringCustomer name is required"),
    referredName: z.string().min(1, "referredName is required"),
    referredPhone: z.string().min(1, "referredPhone is required"),
    referredLeadId: z.string().optional(),
    referredCustomerId: z.string().optional(),
  })
});

export const updateReferralSchema = z.object({
  body: z.object({
    status: z.enum(["Pending", "Converted", "Lost"]).optional(),
    rewardPointsApplied: z.number().optional(),
    referredCustomerId: z.string().optional(),
  })
});

export type CreateReferralDTO = z.infer<typeof createReferralSchema>['body'];
export type UpdateReferralDTO = z.infer<typeof updateReferralSchema>['body'];
