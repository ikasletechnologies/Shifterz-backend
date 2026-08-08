import { z } from 'zod';

export const createOutpassSchema = z.object({
  body: z.object({
    vehicle: z.string().optional(),
    model: z.string().optional(),
    customer: z.string().optional(),
    phone: z.string().optional(),
    service: z.string().optional(),
    outTime: z.string().optional(),
    securityName: z.string().optional(),
    technicianName: z.string().optional(),
    remarks: z.string().optional(),
    carInId: z.string().optional(),
    jobCardId: z.string().optional(),
    invoiceId: z.string().optional(),
    customerConfirmation: z.boolean().optional(),
  })
});

export const updateOutpassSchema = z.object({
  body: z.object({
    vehicle: z.string().optional(),
    model: z.string().optional(),
    customer: z.string().optional(),
    phone: z.string().optional(),
    service: z.string().optional(),
    outTime: z.string().optional(),
    securityName: z.string().optional(),
    technicianName: z.string().optional(),
    remarks: z.string().optional(),
  })
});

export type CreateOutpassDTO = z.infer<typeof createOutpassSchema>['body'];
export type UpdateOutpassDTO = z.infer<typeof updateOutpassSchema>['body'];
