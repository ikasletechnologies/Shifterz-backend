import { z } from 'zod';

export const createFranchiseSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    city: z.string().min(1, "City is required"),
    owner: z.string().min(1, "Owner is required"),
    phone: z.string().min(1, "Phone is required"),
    revenue: z.number().optional().default(0),
    jobs: z.number().optional().default(0),
    royaltyPct: z.number().optional().default(0),
    status: z.string().optional().default("Active"),
    businessName: z.string().optional(),
    gstNumber: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    state: z.string().optional(),
    pinCode: z.string().optional(),
    licenseStatus: z.string().optional(),
    gstRegistrationType: z.string().optional()
  })
});

export const updateFranchiseSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    city: z.string().optional(),
    owner: z.string().optional(),
    phone: z.string().optional(),
    revenue: z.number().optional(),
    jobs: z.number().optional(),
    royaltyPct: z.number().optional(),
    status: z.string().optional(),
    businessName: z.string().optional(),
    gstNumber: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    state: z.string().optional(),
    pinCode: z.string().optional(),
    licenseStatus: z.string().optional(),
    gstRegistrationType: z.string().optional()
  })
});

export type CreateFranchiseDTO = z.infer<typeof createFranchiseSchema>['body'];
export type UpdateFranchiseDTO = z.infer<typeof updateFranchiseSchema>['body'];
