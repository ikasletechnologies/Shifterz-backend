import { z } from 'zod';

export const createLeadSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    phone: z.string().optional(),
    alternateNumber: z.string().optional(),
    email: z.string().email("Invalid email").optional().or(z.literal("")),
    city: z.string().optional(),
    source: z.string().optional(),
    service: z.string().optional(),
    vehicle: z.string().optional(),
    vehicleMake: z.string().optional(),
    vehicleModel: z.string().optional(),
    assignedTo: z.string().optional(),
    status: z.string().optional(),
    notes: z.string().optional(),
    budget: z.union([z.string(), z.number()]).optional(),
    priority: z.string().optional(),
    date: z.string().optional(),
    lostReason: z.string().optional(),
  })
});

export const updateLeadSchema = z.object({
  body: createLeadSchema.shape.body.partial()
}).refine(
  (data) => {
    if (data.body.status === "Lost" && (!data.body.lostReason || data.body.lostReason.trim() === "")) {
      return false;
    }
    return true;
  },
  {
    message: "lostReason is required when status is 'Lost'",
    path: ["body", "lostReason"]
  }
);

