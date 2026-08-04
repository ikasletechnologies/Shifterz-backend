import { z } from 'zod';

export const createJobCardSchema = z.object({
  body: z.object({
    vehicle: z.string().min(1, "Vehicle number is required"),
    customer: z.string().optional(),
    service: z.string().optional(),
    services: z.any().optional(),           // JSON array of service line items
    technician: z.string().optional(),
    technicianId: z.string().nullable().optional(),
    supportingTechnicianIds: z.array(z.string()).optional(),
    serviceAdvisor: z.string().nullable().optional(),
    serviceAdvisorId: z.string().nullable().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    startDate: z.string().optional(),
    estCompletion: z.string().optional(),
    notes: z.string().optional(),
    remarks: z.string().nullable().optional(),
    carInId: z.string().nullable().optional(), // Check-In reference
    photos: z.array(z.string()).optional(),
    customerSignature: z.string().nullable().optional(),
    companyAcknowledgement: z.string().nullable().optional(),
  })
});

export const updateJobCardSchema = z.object({
  body: z.object({
    vehicle: z.string().optional(),
    customer: z.string().optional(),
    service: z.string().optional(),
    services: z.any().optional(),
    technician: z.string().optional(),
    technicianId: z.string().nullable().optional(),
    supportingTechnicianIds: z.array(z.string()).optional(),
    serviceAdvisor: z.string().nullable().optional(),
    serviceAdvisorId: z.string().nullable().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    startDate: z.string().optional(),
    estCompletion: z.string().optional(),
    actualCompletion: z.string().nullable().optional(),
    notes: z.string().optional(),
    remarks: z.string().nullable().optional(),
    carInId: z.string().nullable().optional(),
    photos: z.array(z.string()).optional(),
    qcNotes: z.string().nullable().optional(),
    passedAt: z.string().nullable().optional(),
    failedAt: z.string().nullable().optional(),
    customerSignature: z.string().nullable().optional(),
    companyAcknowledgement: z.string().nullable().optional(),
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

// ─── Additional Work Approval ─────────────────────────────────────────────────

export const createAdditionalWorkSchema = z.object({
  body: z.object({
    description: z.string().min(1, "Description is required"),
    estimatedCost: z.number().positive("Estimated cost must be positive"),
  })
});

export const approveAdditionalWorkSchema = z.object({
  body: z.object({
    status: z.enum(['Approved', 'Rejected']),
    rejectionNote: z.string().optional().nullable(),
    customerApproved: z.boolean().optional(),
  })
});

// ─── Work Stage (10.5) ─────────────────────────────────────────────────────────

export const workStageUpdateSchema = z.object({
  body: z.object({
    stage: z.string().min(1, "Stage is required"),
    notes: z.string().optional(),
  })
});

// ─── Work Notes (10.9) ─────────────────────────────────────────────────────────

export const workNoteSchema = z.object({
  body: z.object({
    note: z.string().min(1, "Note is required"),
  })
});

// ─── Material Consumption (10.8) ───────────────────────────────────────────────

export const materialConsumptionSchema = z.object({
  body: z.object({
    itemId: z.string().min(1, "Item is required"),
    quantity: z.number().positive("Quantity must be positive"),
    unit: z.string().optional(),
  })
});

export const materialConsumptionResolveSchema = z.object({
  body: z.object({
    status: z.enum(['Approved', 'Rejected']),
    rejectionNote: z.string().optional().nullable(),
  })
});

// ─── Work Photos (10.6) ────────────────────────────────────────────────────────

export const JOB_PHOTO_CATEGORIES = [
  'BEFORE_SERVICE',
  'DURING_SERVICE',
  'AFTER_SERVICE',
  'SPECIAL_WORK',
  'ADDITIONAL_DAMAGE',
] as const;

export type CreateJobCardDTO = z.infer<typeof createJobCardSchema>['body'];
export type UpdateJobCardDTO = z.infer<typeof updateJobCardSchema>['body'];
export type QcChecklistDTO = z.infer<typeof qcChecklistSchema>['body'];
export type CreateAdditionalWorkDTO = z.infer<typeof createAdditionalWorkSchema>['body'];
export type ApproveAdditionalWorkDTO = z.infer<typeof approveAdditionalWorkSchema>['body'];
export type WorkStageUpdateDTO = z.infer<typeof workStageUpdateSchema>['body'];
export type WorkNoteDTO = z.infer<typeof workNoteSchema>['body'];
export type MaterialConsumptionDTO = z.infer<typeof materialConsumptionSchema>['body'];
export type MaterialConsumptionResolveDTO = z.infer<typeof materialConsumptionResolveSchema>['body'];
