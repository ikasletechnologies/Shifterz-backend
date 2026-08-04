import { z } from 'zod';

export const createCheckinSchema = z.object({
  body: z.object({
    vehicle: z.string().min(1, "Vehicle number is required"),
    model: z.string().min(1, "Model is required"),
    customer: z.string().min(1, "Customer name is required"),
    phone: z.string().min(1, "Phone number is required"),
    service: z.string().min(1, "Requested service is required"),
    inTime: z.string().optional().transform(val => val ? new Date(val) : new Date()),
    odometer: z.union([z.string(), z.number()]).transform(val => String(val)),
    notes: z.string().optional().default(""),
    
    // Check-In fields
    receivedById: z.string().optional().nullable(),
    receivedByName: z.string().optional().nullable(),
    fuelLevel: z.string().optional().nullable(),
    keyCount: z.number().optional().default(1),
    expectedDelivery: z.string().optional().nullable().transform(val => val ? new Date(val) : null),

    // Initial Inspection fields
    scratches: z.string().optional().nullable(),
    dents: z.string().optional().nullable(),
    brokenParts: z.string().optional().nullable(),
    glassDamage: z.string().optional().nullable(),
    wheelDamage: z.string().optional().nullable(),
    interiorCondition: z.string().optional().nullable(),
    accessoriesReceived: z.string().optional().nullable(),
    remarks: z.string().optional().nullable(),

    // Vehicle Photographs
    photoFront: z.string().optional().nullable(),
    photoRear: z.string().optional().nullable(),
    photoLeft: z.string().optional().nullable(),
    photoRight: z.string().optional().nullable(),
    photoDashboard: z.string().optional().nullable(),
    photoOdometer: z.string().optional().nullable(),
    photoDamages: z.array(z.string()).optional().default([]),

    // Accessories Checklist
    hasSpareWheel: z.boolean().optional().default(false),
    hasJack: z.boolean().optional().default(false),
    hasToolkit: z.boolean().optional().default(false),
    hasFloorMats: z.boolean().optional().default(false),
    hasFastag: z.boolean().optional().default(false),
    hasDashCam: z.boolean().optional().default(false),
    hasUsbCharger: z.boolean().optional().default(false),
    otherAccessories: z.string().optional().nullable()
  })
});

export const updateCheckinSchema = z.object({
  body: z.object({
    vehicle: z.string().optional(),
    model: z.string().optional(),
    customer: z.string().optional(),
    phone: z.string().optional(),
    service: z.string().optional(),
    odometer: z.union([z.string(), z.number()]).transform(val => String(val)).optional(),
    notes: z.string().optional(),

    // Check-In & Inspection fields
    receivedById: z.string().optional().nullable(),
    receivedByName: z.string().optional().nullable(),
    fuelLevel: z.string().optional().nullable(),
    keyCount: z.number().optional(),
    expectedDelivery: z.string().optional().nullable().transform(val => val ? new Date(val) : null),
    scratches: z.string().optional().nullable(),
    dents: z.string().optional().nullable(),
    brokenParts: z.string().optional().nullable(),
    glassDamage: z.string().optional().nullable(),
    wheelDamage: z.string().optional().nullable(),
    interiorCondition: z.string().optional().nullable(),
    accessoriesReceived: z.string().optional().nullable(),
    remarks: z.string().optional().nullable(),

    // Vehicle Photographs
    photoFront: z.string().optional().nullable(),
    photoRear: z.string().optional().nullable(),
    photoLeft: z.string().optional().nullable(),
    photoRight: z.string().optional().nullable(),
    photoDashboard: z.string().optional().nullable(),
    photoOdometer: z.string().optional().nullable(),
    photoDamages: z.array(z.string()).optional(),

    // Accessories Checklist
    hasSpareWheel: z.boolean().optional(),
    hasJack: z.boolean().optional(),
    hasToolkit: z.boolean().optional(),
    hasFloorMats: z.boolean().optional(),
    hasFastag: z.boolean().optional(),
    hasDashCam: z.boolean().optional(),
    hasUsbCharger: z.boolean().optional(),
    otherAccessories: z.string().optional().nullable()
  })
});

export const checkoutSchema = z.object({
  body: z.object({
    securityName: z.string().optional(),
    deliveredById: z.string().optional().nullable(),
    deliveredByName: z.string().optional().nullable(),
    customerAcknowledgement: z.string().optional().nullable(),
  })
});

export type CreateCheckinDTO = z.infer<typeof createCheckinSchema>['body'];
export type UpdateCheckinDTO = z.infer<typeof updateCheckinSchema>['body'];
export type CheckoutDTO = z.infer<typeof checkoutSchema>['body'];
