import { z } from 'zod';

export const createJobCardSchema = z.object({
  body: z.object({
    vehicle: z.string().min(1, "Vehicle number is required"),
    customer: z.string().optional(),
    service: z.string().optional(),
    technician: z.string().optional(),
    technicianId: z.string().nullable().optional(),
    serviceAdvisor: z.string().nullable().optional(),
    serviceAdvisorId: z.string().nullable().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    startDate: z.string().optional(),
    estCompletion: z.string().optional(),
    notes: z.string().optional(),
    photos: z.array(z.string()).optional(),
  })
});

export const updateJobCardSchema = z.object({
  body: z.object({
    vehicle: z.string().optional(),
    customer: z.string().optional(),
    service: z.string().optional(),
    technician: z.string().optional(),
    technicianId: z.string().nullable().optional(),
    serviceAdvisor: z.string().nullable().optional(),
    serviceAdvisorId: z.string().nullable().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    startDate: z.string().optional(),
    estCompletion: z.string().optional(),
    actualCompletion: z.string().nullable().optional(),
    notes: z.string().optional(),
    photos: z.array(z.string()).optional(),
    qcNotes: z.string().nullable().optional(),
    passedAt: z.string().nullable().optional(),
    failedAt: z.string().nullable().optional(),
  })
});

export const qcChecklistSchema = z.object({
  body: z.object({
    checklist: z.array(z.object({
      id: z.string(),
      label: z.string(),
      passed: z.boolean(),
      remark: z.string().optional(),
    })),
  })
});

export type CreateJobCardDTO = z.infer<typeof createJobCardSchema>['body'];
export type UpdateJobCardDTO = z.infer<typeof updateJobCardSchema>['body'];
export type QcChecklistDTO = z.infer<typeof qcChecklistSchema>['body'];
