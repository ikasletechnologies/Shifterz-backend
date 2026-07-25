import { z } from 'zod';

export const createCheckinSchema = z.object({
  body: z.object({
    vehicle: z.string().min(1, "Vehicle number is required"),
    model: z.string().optional(),
    customer: z.string().optional(),
    phone: z.string().optional(),
    service: z.string().optional(),
    inTime: z.string().optional(),
    odometer: z.union([z.string(), z.number()]).optional(),
    notes: z.string().optional(),
  })
});

export const updateCheckinSchema = z.object({
  body: z.object({
    vehicle: z.string().optional(),
    model: z.string().optional(),
    customer: z.string().optional(),
    phone: z.string().optional(),
    service: z.string().optional(),
    odometer: z.union([z.string(), z.number()]).optional(),
    notes: z.string().optional(),
  })
});

export const checkoutSchema = z.object({
  body: z.object({
    securityName: z.string().optional(),
  })
});

export type CreateCheckinDTO = z.infer<typeof createCheckinSchema>['body'];
export type UpdateCheckinDTO = z.infer<typeof updateCheckinSchema>['body'];
export type CheckoutDTO = z.infer<typeof checkoutSchema>['body'];
