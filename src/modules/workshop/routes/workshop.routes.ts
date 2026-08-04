import { Router } from 'express';
import { WorkshopController } from '../controller/workshop.controller.js';
import { authenticate } from '../../../middleware/auth.middleware.js';

export const workshopRouter = Router();
const controller = new WorkshopController();

workshopRouter.use(authenticate);

workshopRouter.get('/dashboard', controller.getDashboard);
workshopRouter.get('/franchise-dashboard', controller.getFranchiseDashboard);
workshopRouter.post('/dispatch-reminders', controller.dispatchReminders);
