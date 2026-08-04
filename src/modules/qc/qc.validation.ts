import { z } from 'zod';

// ─── Photo Verification (12.5) ─────────────────────────────────────────────────

export const QC_PHOTO_CATEGORIES = [
  'FRONT_VIEW',
  'REAR_VIEW',
  'LEFT_SIDE',
  'RIGHT_SIDE',
  'INTERIOR',
  'COMPLETED_SERVICE',
  'SPECIAL_WORK',
] as const;

// ─── QC Assignment (12.3) ───────────────────────────────────────────────────────

export const assignQcSchema = z.object({
  body: z.object({
    inspectorId: z.string().min(1, "Quality Inspector is required"),
    scheduledAt: z.string().optional(),
    priority: z.string().optional(),
    remarks: z.string().optional(),
  })
});

// ─── QC Checklist (12.4) ────────────────────────────────────────────────────────

export const qcChecklistSchema = z.object({
  body: z.object({
    checklist: z.array(z.object({
      id: z.string(),
      passed: z.boolean(),
      remark: z.string().optional(),
    })).min(1, "Checklist cannot be empty"),
  })
});

// ─── QC Decision (12.6) ─────────────────────────────────────────────────────────

export const qcDecisionSchema = z.object({
  body: z.object({
    result: z.enum(['Passed', 'Failed']),
    reason: z.string().optional(),
    remarks: z.string().optional(),
    reworkRequired: z.boolean().optional(),
  })
});

// ─── Checklist Template CRUD ────────────────────────────────────────────────────

export const createChecklistTemplateItemSchema = z.object({
  body: z.object({
    category: z.string().min(1, "Category is required"),
    label: z.string().min(1, "Label is required"),
    order: z.number().int().optional(),
    franchiseId: z.string().nullable().optional(), // omit/null = global item
  })
});

export const updateChecklistTemplateItemSchema = z.object({
  body: z.object({
    category: z.string().optional(),
    label: z.string().optional(),
    order: z.number().int().optional(),
  })
});

export type AssignQcDTO = z.infer<typeof assignQcSchema>['body'];
export type QcChecklistDTO = z.infer<typeof qcChecklistSchema>['body'];
export type QcDecisionDTO = z.infer<typeof qcDecisionSchema>['body'];
export type CreateChecklistTemplateItemDTO = z.infer<typeof createChecklistTemplateItemSchema>['body'];
export type UpdateChecklistTemplateItemDTO = z.infer<typeof updateChecklistTemplateItemSchema>['body'];
