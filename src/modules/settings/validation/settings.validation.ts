import { z } from 'zod';

export const updateSettingSchema = z.object({
  body: z.object({
    companyName: z.string().optional(),
    companyLogo: z.string().optional().nullable(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    gstin: z.string().optional(),
    panNumber: z.string().optional().nullable(),
    registeredAddress: z.string().optional().nullable(),
    branchAddress: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    country: z.string().optional().nullable(),
    pinCode: z.string().optional().nullable(),
    website: z.string().optional().nullable(),
    gstPct: z.number().optional(),
    currency: z.string().optional(),
    agents: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
    leadSources: z.array(z.string()).optional(),
    leadStatuses: z.array(z.string()).optional(),
    lostReasons: z.array(z.string()).optional(),
    securityGuards: z.array(z.string()).optional(),
    referralProgram: z.any().optional(),
    loyaltyProgram: z.any().optional(),
    workingHours: z.any().optional(),
    notificationTemplates: z.any().optional(),
    numberingSeries: z.any().optional()
  })
});

export type UpdateSettingDTO = z.infer<typeof updateSettingSchema>['body'];
