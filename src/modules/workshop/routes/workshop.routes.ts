import { Router } from 'express';
import { WorkshopController } from '../controller/workshop.controller.js';
import { authenticate, requireAction } from '../../../middleware/auth.middleware.js';
import { requireSystemCredential } from '../../../middleware/system-auth.middleware.js';

export const workshopRouter = Router();
const controller = new WorkshopController();

// D-20 — registered before workshopRouter.use(authenticate) below, so this
// route never requires a human JWT.
workshopRouter.post(
  '/dispatch-reminders',
  requireSystemCredential('scheduler:workshop:run'),
  controller.dispatchReminders
);

workshopRouter.use(authenticate);

workshopRouter.get('/dashboard', controller.getDashboard);
// REP-01C (D-REP7) — gated with the same, already-locked D-21 action as
// the canonical franchise dashboard (dashboards:executive:view), matching
// its own management-tier audience. Not a new action.
workshopRouter.get('/franchise-dashboard', requireAction('dashboards:executive:view'), controller.getFranchiseDashboard);
