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

// Phase 4B-2C — explicit three-state result (Unanswered/Passed/Failed)
// replaces the old `passed: boolean`, which could not represent "not yet
// looked at" without conflating it with either Passed or Failed. This is
// route-level defense-in-depth; qc.service.ts's submitChecklist enforces the
// same duplicate-ID and failed-remark rules independently, since existing
// callers (and this repo's test suites) invoke the service directly without
// going through this Zod schema at all.
export const qcChecklistSchema = z.object({
  body: z.object({
    checklist: z.array(z.object({
      id: z.string(),
      result: z.enum(['Unanswered', 'Passed', 'Failed']),
      remark: z.string().optional(),
    })).min(1, "Checklist cannot be empty")
      .superRefine((items, ctx) => {
        const seen = new Set<string>();
        items.forEach((item, index) => {
          if (seen.has(item.id)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'id'], message: `Duplicate checklist item ID: ${item.id}` });
          }
          seen.add(item.id);
          if (item.result === 'Failed' && !(item.remark && item.remark.trim())) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'remark'], message: `A remark is required when item ${item.id} is marked Failed.` });
          }
        });
      }),
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
    mandatory: z.boolean().optional(), // omit = false (Phase 4B-2C)
  })
});

export const updateChecklistTemplateItemSchema = z.object({
  body: z.object({
    category: z.string().optional(),
    label: z.string().optional(),
    order: z.number().int().optional(),
    mandatory: z.boolean().optional(),
  })
});

// ─── Checklist Template VERSIONS (Phase 4B-2D-D — Draft/Publish foundation) ────

// `logicalItemId` is optional here deliberately: omitting it means "this is a
// brand-new conceptual item" (the service generates a fresh one, matching
// QCChecklistTemplate.logicalItemId's own @default(uuid()) semantics);
// supplying it means "this is the evolved definition of an existing logical
// item" (e.g. carried forward from a prior version, or from a live
// QCChecklistTemplate row's own logicalItemId), preserving identity across
// versions per Part 3's requirement.
const versionItemSchema = z.object({
  logicalItemId: z.string().min(1).optional(),
  label: z.string().min(1, "Label is required"),
  category: z.string().min(1, "Category is required"),
  order: z.number().int(),
  mandatory: z.boolean(),
});

export const createTemplateVersionSchema = z.object({
  body: z.object({
    items: z.array(versionItemSchema).min(1, "A template version must contain at least one checklist item"),
  })
});

export const updateTemplateVersionSchema = z.object({
  body: z.object({
    items: z.array(versionItemSchema).min(1, "A template version must contain at least one checklist item"),
  })
});

export type AssignQcDTO = z.infer<typeof assignQcSchema>['body'];
export type QcChecklistDTO = z.infer<typeof qcChecklistSchema>['body'];
export type QcDecisionDTO = z.infer<typeof qcDecisionSchema>['body'];
export type CreateChecklistTemplateItemDTO = z.infer<typeof createChecklistTemplateItemSchema>['body'];
export type UpdateChecklistTemplateItemDTO = z.infer<typeof updateChecklistTemplateItemSchema>['body'];
export type CreateTemplateVersionDTO = z.infer<typeof createTemplateVersionSchema>['body'];
export type UpdateTemplateVersionDTO = z.infer<typeof updateTemplateVersionSchema>['body'];
export type VersionItemDTO = z.infer<typeof versionItemSchema>;
