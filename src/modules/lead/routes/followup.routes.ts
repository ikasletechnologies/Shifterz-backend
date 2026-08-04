import { Router } from 'express';
import { FollowUpController } from '../controller/followup.controller.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { createFollowUpSchema, updateFollowUpSchema } from '../validation/followup.validation.js';

export const followUpRouter = Router({ mergeParams: true }); // mergeParams gives access to :leadId
const controller = new FollowUpController();

followUpRouter.use(authenticate);

// Upcoming follow-ups (franchise / HQ scope) — must be before /:id routes
followUpRouter.get('/upcoming', controller.getUpcoming);

// Follow-up history for a specific lead
followUpRouter.get('/', controller.getHistory);

// Add a new follow-up
followUpRouter.post('/', validate(createFollowUpSchema), controller.addFollowUp);

// Update/correct a follow-up
followUpRouter.put('/:id', validate(updateFollowUpSchema), controller.updateFollowUp);
