import { Router } from 'express';
import { LeadController } from '../controller/lead.controller.js';
import { LeadDashboardController } from '../controller/leadDashboard.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { createLeadSchema, updateLeadSchema } from '../validation/lead.validation.js';
import { followUpRouter } from './followup.routes.js';

export const leadRouter = Router();
const controller = new LeadController();
const dashboardController = new LeadDashboardController();

leadRouter.use(authenticate);

// Dashboard and Reports
leadRouter.get('/dashboard', dashboardController.getDashboard);
leadRouter.get('/reports/:type', dashboardController.getReport);

leadRouter.get('/', controller.getLeads);
leadRouter.post('/', validate(createLeadSchema), controller.createLead);
leadRouter.put('/:id', validate(updateLeadSchema), controller.updateLead);
leadRouter.delete('/:id', controller.deleteLead);
leadRouter.post('/:id/transfer', controller.transferLead);
leadRouter.post('/:id/convert', controller.convertLead);
leadRouter.get('/:id/assignment-history', controller.getAssignmentHistory);

// Follow-up sub-router (mergeParams allows :leadId access inside)
leadRouter.use('/:leadId/followups', followUpRouter);


