import { Router } from 'express';
import { CallbackController } from '../controller/callback.controller.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { validate } from '../../../middleware/validate.middleware.js';
import {
  createCallbackSchema,
  completeCallbackSchema,
  rescheduleCallbackSchema,
} from '../validation/callback.validation.js';

export const callbackRouter = Router();
const controller = new CallbackController();

callbackRouter.use(authenticate);

// Calendar view (all event types aggregated)
callbackRouter.get('/calendar', controller.getCalendar);

// Employee's own callback task list
callbackRouter.get('/my', controller.getMyCallbacks);

// Franchise / HQ all callbacks
callbackRouter.get('/', controller.getFranchiseCallbacks);

// Schedule a new callback
callbackRouter.post('/', validate(createCallbackSchema), controller.schedule);

// Complete a callback
callbackRouter.post('/:id/complete', validate(completeCallbackSchema), controller.complete);

// Reschedule a callback
callbackRouter.post('/:id/reschedule', validate(rescheduleCallbackSchema), controller.reschedule);

// Soft delete a callback
callbackRouter.delete('/:id', controller.deleteCallback);

// Internal: dispatch reminder notifications (called by background scheduler)
callbackRouter.post('/reminders/dispatch', controller.dispatchReminders);
