import { z } from 'zod';

export const setRoleActionsSchema = z.object({
  body: z.object({
    // Explicit empty array is a valid, intentional grant (revoke everything
    // for this role) — z.array(z.string()) already accepts [] without any
    // special-casing needed.
    actions: z.array(z.string()),
  })
});

export type SetRoleActionsDTO = z.infer<typeof setRoleActionsSchema>['body'];
