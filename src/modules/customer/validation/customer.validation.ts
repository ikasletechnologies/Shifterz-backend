import { z } from 'zod';

export const createCustomerSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    phone: z.string().optional(),
    email: z.string().email("Invalid email").optional().or(z.literal("")),
    vehicle: z.string().optional(),
    model: z.string().optional(),
    alternateNumber: z.string().optional(),
    city: z.string().optional(),
    vehicleMake: z.string().optional(),
    vehicleModel: z.string().optional(),
    rewardPoints: z.number().int().optional(),
    dob: z.string().optional().transform((val) => val ? new Date(val) : null),
    anniversary: z.string().optional().transform((val) => val ? new Date(val) : null),
    gstNumber: z.string().optional(),
    address: z.string().optional(),
    state: z.string().optional(),
    pinCode: z.string().optional(),
    status: z.enum(["Active", "Inactive"]).optional(),
  })
});

export const updateCustomerSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name cannot be empty").optional(),
    phone: z.string().optional(),
    email: z.string().email("Invalid email").optional().or(z.literal("")),
    vehicle: z.string().optional(),
    model: z.string().optional(),
    alternateNumber: z.string().optional(),
    city: z.string().optional(),
    vehicleMake: z.string().optional(),
    vehicleModel: z.string().optional(),
    rewardPoints: z.number().int().optional(),
    dob: z.string().optional().transform((val) => val ? new Date(val) : null),
    anniversary: z.string().optional().transform((val) => val ? new Date(val) : null),
    gstNumber: z.string().optional(),
    address: z.string().optional(),
    state: z.string().optional(),
    pinCode: z.string().optional(),
    status: z.enum(["Active", "Inactive"]).optional(),
  })
});

export const createVehicleSchema = z.object({
  body: z.object({
    vehicleNo: z.string().min(1, "Vehicle number is required"),
    make: z.string().min(1, "Vehicle make is required"),
    model: z.string().min(1, "Vehicle model is required"),
    variant: z.string().optional(),
    year: z.number().int().optional(),
    fuelType: z.string().optional(),
    color: z.string().optional(),
    chassisNo: z.string().optional(),
    engineNo: z.string().optional(),
    odometer: z.number().int().optional(),
    vin: z.string().optional(),
  })
});

export const updateVehicleSchema = z.object({
  body: z.object({
    vehicleNo: z.string().optional(),
    make: z.string().optional(),
    model: z.string().optional(),
    variant: z.string().optional(),
    year: z.number().int().optional(),
    fuelType: z.string().optional(),
    color: z.string().optional(),
    chassisNo: z.string().optional(),
    engineNo: z.string().optional(),
    odometer: z.number().int().optional(),
    vin: z.string().optional(),
  })
});

export const createWarrantySchema = z.object({
  body: z.object({
    vehicleNo: z.string().min(1, "Vehicle number is required"),
    jobId: z.string().optional(),
    invoiceId: z.string().optional(),
    itemName: z.string().min(1, "Item name is required"),
    durationDays: z.number().int().positive("Duration must be a positive integer"),
    startDate: z.string().optional().transform((val) => val ? new Date(val) : new Date()),
    notes: z.string().optional(),
  })
});

export const createReminderSchema = z.object({
  body: z.object({
    vehicleNo: z.string().min(1, "Vehicle number is required"),
    reminderType: z.string().min(1, "Reminder type is required"),
    scheduledDate: z.string().datetime({ message: "Invalid date format, must be ISO-8601" }).transform((val) => new Date(val)),
    notes: z.string().optional(),
  })
});

export const createComplaintSchema = z.object({
  body: z.object({
    title: z.string().min(1, "Title is required"),
    description: z.string().min(1, "Description is required"),
    severity: z.enum(["Low", "Medium", "High"]).optional(),
  })
});

export const createEstimateSchema = z.object({
  body: z.object({
    id: z.string().min(1, "Estimate ID is required"),
    customerName: z.string().min(1, "Customer name is required"),
    phone: z.string().min(1, "Phone number is required"),
    vehicle: z.string().min(1, "Vehicle description is required"),
    model: z.string().min(1, "Model is required"),
    amount: z.number().positive("Amount must be positive"),
    status: z.string().optional(),
    items: z.any().optional(),
    estimatedDelivery: z.string().optional().nullable().transform(val => val ? new Date(val) : null),
    warranty: z.string().optional().nullable()
  })
});

export type CreateCustomerDTO = z.infer<typeof createCustomerSchema>['body'];
export type UpdateCustomerDTO = z.infer<typeof updateCustomerSchema>['body'];
export type CreateVehicleDTO = z.infer<typeof createVehicleSchema>['body'];
export type UpdateVehicleDTO = z.infer<typeof updateVehicleSchema>['body'];
export type CreateWarrantyDTO = z.infer<typeof createWarrantySchema>['body'];
export type CreateReminderDTO = z.infer<typeof createReminderSchema>['body'];
export type CreateComplaintDTO = z.infer<typeof createComplaintSchema>['body'];
export type CreateEstimateDTO = z.infer<typeof createEstimateSchema>['body'];

