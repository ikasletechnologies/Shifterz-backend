import { Router } from 'express';
import { ServiceAdvisorController } from './service-advisor.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

export const serviceAdvisorRouter = Router();
const controller = new ServiceAdvisorController();

serviceAdvisorRouter.use(authenticate);

serviceAdvisorRouter.get('/management', controller.getManagement);
