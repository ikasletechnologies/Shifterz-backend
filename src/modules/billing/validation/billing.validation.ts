import { z } from 'zod';

export const createInvoiceSchema = z.object({
  body: z.object({
    type: z.string().min(1, "Type is required"),
    client: z.string().min(1, "Client name is required"),
    phone: z.string().optional(),
    vehicle: z.string().optional(),
    service: z.string().optional(),
    amount: z.union([z.string(), z.number()]).optional(),
    gst: z.union([z.string(), z.number()]).optional(),
    discount: z.union([z.string(), z.number()]).optional(),
    status: z.string().optional(),
    date: z.string().optional(),
    dueDate: z.string().optional(),
    notes: z.string().optional(),
    gstNumber: z.string().nullable().optional(),
    items: z.any().optional(), // Prisma Json type
    bankDetails: z.string().nullable().optional(),
    paymentTerms: z.string().nullable().optional(),
    deliveryTerms: z.string().nullable().optional(),
    authorizedSignatory: z.string().nullable().optional(),
    createdBy: z.string().nullable().optional(),
    jobId: z.string().nullable().optional(),
    franchiseId: z.string().nullable().optional(),
    warranty: z.string().nullable().optional(),
    discountReason: z.string().nullable().optional(),
  })
});

export const updateInvoiceSchema = z.object({
  body: z.object({
    status: z.string().optional(),
    notes: z.string().optional(),
    dueDate: z.string().optional(),
    amount: z.union([z.string(), z.number()]).optional(),
    gst: z.union([z.string(), z.number()]).optional(),
    discount: z.union([z.string(), z.number()]).optional(),
    type: z.string().optional(),
    client: z.string().optional(),
    phone: z.string().optional(),
    vehicle: z.string().optional(),
    service: z.string().optional(),
    items: z.any().optional(),
    bankDetails: z.string().nullable().optional(),
    paymentTerms: z.string().nullable().optional(),
    deliveryTerms: z.string().nullable().optional(),
    authorizedSignatory: z.string().nullable().optional(),
    modifiedBy: z.string().optional(),
    cancelledBy: z.string().optional(),
    approvedBy: z.string().optional(),
    warranty: z.string().nullable().optional(),
    discountReason: z.string().nullable().optional(),
  })
});

export const cancelInvoiceSchema = z.object({
  body: z.object({
    reason: z.string().min(1, "Cancellation reason is required"),
  })
});

export const shareInvoiceSchema = z.object({
  body: z.object({
    channel: z.enum(["whatsapp", "email"]),
  })
});

export type CreateInvoiceDTO = z.infer<typeof createInvoiceSchema>['body'];
export type UpdateInvoiceDTO = z.infer<typeof updateInvoiceSchema>['body'];
export type CancelInvoiceDTO = z.infer<typeof cancelInvoiceSchema>['body'];
export type ShareInvoiceDTO = z.infer<typeof shareInvoiceSchema>['body'];
