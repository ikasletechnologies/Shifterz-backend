import { z } from 'zod';

export const createEmployeeSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Name is required"),
    phone: z.string().optional(),
    email: z.string().optional(),
    status: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    role: z.string().optional(),
    franchiseId: z.string().nullable().optional(),
    permissions: z.array(z.string()).optional()
  })
});

export const updateEmployeeSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    status: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    role: z.string().optional(),
    franchiseId: z.string().nullable().optional(),
    permissions: z.array(z.string()).optional()
  })
});

export type CreateEmployeeDTO = z.infer<typeof createEmployeeSchema>['body'];
export type UpdateEmployeeDTO = z.infer<typeof updateEmployeeSchema>['body'];
