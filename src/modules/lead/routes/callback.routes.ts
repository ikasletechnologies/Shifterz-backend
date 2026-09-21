import { Router } from 'express';
import { CallbackController } from '../controller/callback.controller.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { requireSystemCredential } from '../../../middleware/system-auth.middleware.js';
import { validate } from '../../../middleware/validate.middleware.js';
import {
  createCallbackSchema,
  completeCallbackSchema,
  rescheduleCallbackSchema,
} from '../validation/callback.validation.js';

export const callbackRouter = Router();
const controller = new CallbackController();

// D-20 — registered before callbackRouter.use(authenticate) below, so this
// route is matched and fully handled before that blanket human-auth
// middleware ever runs; it never requires a human JWT.
callbackRouter.post(
  '/reminders/dispatch',
  requireSystemCredential('scheduler:callbacks:dispatch'),
  controller.dispatchReminders
);

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
