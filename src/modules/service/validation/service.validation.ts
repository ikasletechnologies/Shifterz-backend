import { z } from 'zod';

export const createServiceSchema = z.object({
  body: z.object({
    code: z.string().optional(),
    name: z.string().min(1, "Service name is required"),
    category: z.string().min(1, "Category is required"),
    price: z.coerce.number().min(0, "Price must be a positive number"),
    minPrice: z.coerce.number().min(0, "Minimum price must be a positive number").optional().default(0),
    gst: z.coerce.number().min(0, "GST must be a positive number").optional().default(18),
    duration: z.string().min(1, "Duration is required"),
    warranty: z.string().optional().default("1 Year"),
    desc: z.string().optional().default(""),
    status: z.enum(["Active", "Inactive"]).optional().default("Active")
  })
});

export const updateServiceSchema = z.object({
  body: z.object({
    code: z.string().optional(),
    name: z.string().optional(),
    category: z.string().optional(),
    price: z.coerce.number().optional(),
    minPrice: z.coerce.number().optional(),
    gst: z.coerce.number().optional(),
    duration: z.string().optional(),
    warranty: z.string().optional(),
    desc: z.string().optional(),
    status: z.enum(["Active", "Inactive"]).optional()
  })
});

export type CreateServiceDTO = z.infer<typeof createServiceSchema>['body'];
export type UpdateServiceDTO = z.infer<typeof updateServiceSchema>['body'];

