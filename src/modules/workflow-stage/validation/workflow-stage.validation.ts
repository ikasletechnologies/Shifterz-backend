import { z } from 'zod';

export const createWorkflowStageSchema = z.object({
  body: z.object({
    name: z.string().min(1, "Stage name is required"),
    order: z.number().int().optional(),
    franchiseId: z.string().nullable().optional(), // omit/null = global stage
  })
});

export const updateWorkflowStageSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    order: z.number().int().optional(),
  })
});

export type CreateWorkflowStageDTO = z.infer<typeof createWorkflowStageSchema>['body'];
export type UpdateWorkflowStageDTO = z.infer<typeof updateWorkflowStageSchema>['body'];
