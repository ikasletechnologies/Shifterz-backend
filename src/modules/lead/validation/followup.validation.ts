import { z } from 'zod';

const COMMUNICATION_MODES = [
  "Phone Call",
  "WhatsApp",
  "SMS",
  "Email",
  "Meeting",
  "Walk-In",
  "Other",
] as const;

const OUTCOMES = [
  "Interested",
  "Not Interested",
  "Callback Requested",
  "No Response",
  "Deal Closed",
] as const;

export const createFollowUpSchema = z.object({
  body: z.object({
    followUpDate: z
      .string()
      .datetime({ message: "followUpDate must be a valid ISO datetime" }),
    mode: z.enum(COMMUNICATION_MODES),
    notes: z.string().min(1, "notes cannot be empty"),
    outcome: z.enum(OUTCOMES).optional(),
    nextAction: z.string().optional(),
    nextFollowUpDate: z.string().datetime().optional(),
    leadStatusUpdate: z.string().optional(),
  }),
});

export const updateFollowUpSchema = z.object({
  body: z.object({
    followUpDate: z.string().datetime().optional(),
    mode: z.enum(COMMUNICATION_MODES).optional(),
    notes: z.string().min(1).optional(),
    outcome: z.enum(OUTCOMES).optional(),
    nextAction: z.string().optional(),
    nextFollowUpDate: z.string().datetime().optional().nullable(),
    leadStatusUpdate: z.string().optional(),
  }),
});

export type CreateFollowUpDTO = z.infer<typeof createFollowUpSchema>['body'];
export type UpdateFollowUpDTO = z.infer<typeof updateFollowUpSchema>['body'];
