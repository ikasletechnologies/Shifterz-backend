import { Router } from 'express';
import { BillingExecutiveController } from './billing-executive.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

export const billingExecutiveRouter = Router();
const controller = new BillingExecutiveController();

billingExecutiveRouter.use(authenticate);

billingExecutiveRouter.get('/management', controller.getManagement);
