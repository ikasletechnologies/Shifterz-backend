import { z } from 'zod';

export const VALID_FRANCHISE_STATUSES = ["PENDING", "ACTIVE", "DEACTIVE"] as const;
export type FranchiseStatus = typeof VALID_FRANCHISE_STATUSES[number];

export function normalizeFranchiseStatus(status?: string | null): FranchiseStatus {
  if (!status) return "PENDING";
  const s = status.trim().toUpperCase();
  if (s === "ACTIVE") return "ACTIVE";
  if (s === "DEACTIVE" || s === "INACTIVE" || s === "DEACTIVATED") return "DEACTIVE";
  if (s === "PENDING") return "PENDING";
  return "PENDING";
}

export const createFranchiseSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    city: z.string().min(1, "City is required"),
    owner: z.string().min(1, "Owner is required"),
    phone: z.string().min(1, "Phone is required"),
    revenue: z.number().optional().default(0),
    jobs: z.number().optional().default(0),
    royaltyPct: z.number().optional().default(0),
    status: z.string()
      .transform(val => normalizeFranchiseStatus(val))
      .refine(val => VALID_FRANCHISE_STATUSES.includes(val), {
        message: "Status must be PENDING, ACTIVE, or DEACTIVE"
      })
      .optional()
      .default("PENDING"),
    businessName: z.string().optional(),
    gstNumber: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    state: z.string().optional(),
    pinCode: z.string().optional(),
    licenseStatus: z.string().optional(),
    gstRegistrationType: z.string().optional(),
    adminUsername: z.string().optional(),
    adminPassword: z.string().optional(),
    startDate: z.string().optional(),
    royalty: z.union([z.string(), z.number()]).optional(),
    code: z.string().optional()
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
    status: z.string()
      .transform(val => normalizeFranchiseStatus(val))
      .refine(val => VALID_FRANCHISE_STATUSES.includes(val), {
        message: "Status must be PENDING, ACTIVE, or DEACTIVE"
      })
      .optional(),
    businessName: z.string().optional(),
    gstNumber: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    state: z.string().optional(),
    pinCode: z.string().optional(),
    licenseStatus: z.string().optional(),
    gstRegistrationType: z.string().optional(),
    adminUsername: z.string().optional(),
    adminPassword: z.string().optional(),
    startDate: z.string().optional(),
    royalty: z.union([z.string(), z.number()]).optional(),
    code: z.string().optional()
  })
});

export type CreateFranchiseDTO = z.infer<typeof createFranchiseSchema>['body'];
export type UpdateFranchiseDTO = z.infer<typeof updateFranchiseSchema>['body'];
