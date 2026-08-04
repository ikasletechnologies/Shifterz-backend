import { z } from 'zod';

export const createAppointmentSchema = z.object({
  body: z.object({
    customerId: z.string().optional().nullable(),
    customerName: z.string().min(1, "Customer name is required"),
    vehicle: z.string().min(1, "Vehicle registration number is required"),
    scheduledDate: z.string().datetime({ message: "Invalid date format, must be ISO-8601" }).transform(val => new Date(val)),
    service: z.string().min(1, "Requested service is required"),
    status: z.enum(["Scheduled", "Confirmed", "Rescheduled", "Cancelled", "Completed", "No Show"]).default("Scheduled"),
    assignedStaff: z.string().optional().nullable(),
    assignedStaffId: z.string().optional().nullable()
  })
});

export const updateAppointmentSchema = z.object({
  body: z.object({
    customerId: z.string().optional().nullable(),
    customerName: z.string().optional(),
    vehicle: z.string().optional(),
    scheduledDate: z.string().datetime().transform(val => new Date(val)).optional(),
    service: z.string().optional(),
    status: z.enum(["Scheduled", "Confirmed", "Rescheduled", "Cancelled", "Completed", "No Show"]).optional(),
    assignedStaff: z.string().optional().nullable(),
    assignedStaffId: z.string().optional().nullable()
  })
});

export type CreateAppointmentDTO = z.infer<typeof createAppointmentSchema>['body'];
export type UpdateAppointmentDTO = z.infer<typeof updateAppointmentSchema>['body'];
