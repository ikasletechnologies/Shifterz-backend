import { z } from 'zod';

export const createCallbackSchema = z.object({
  body: z.object({
    leadId: z.string().optional(),
    leadName: z.string().optional(),
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    scheduledAt: z.string().datetime({ message: 'scheduledAt must be a valid ISO datetime' }),
    reminderNotes: z.string().min(1, 'reminderNotes cannot be empty'),
    assignedToId: z.string().min(1, 'assignedToId is required'),
    assignedTo: z.string().min(1, 'assignedTo name is required'),
  }),
});

export const updateCallbackSchema = z.object({
  body: z.object({
    scheduledAt: z.string().datetime().optional(),
    reminderNotes: z.string().min(1).optional(),
    assignedToId: z.string().optional(),
    assignedTo: z.string().optional(),
    status: z
      .enum(['Pending', 'Completed', 'Rescheduled', 'Overdue'])
      .optional(),
    rescheduledTo: z.string().datetime().optional().nullable(),
    completedNotes: z.string().optional(),
  }),
});

export const completeCallbackSchema = z.object({
  body: z.object({
    completedNotes: z.string().optional(),
  }),
});

export const rescheduleCallbackSchema = z.object({
  body: z.object({
    rescheduledTo: z.string().datetime({ message: 'rescheduledTo must be a valid ISO datetime' }),
    reminderNotes: z.string().optional(),
  }),
});

export type CreateCallbackDTO = z.infer<typeof createCallbackSchema>['body'];
export type UpdateCallbackDTO = z.infer<typeof updateCallbackSchema>['body'];
export type CompleteCallbackDTO = z.infer<typeof completeCallbackSchema>['body'];
export type RescheduleCallbackDTO = z.infer<typeof rescheduleCallbackSchema>['body'];
