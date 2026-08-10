import { Router } from 'express';
import { ReceptionController } from './reception.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

export const receptionRouter = Router();
const controller = new ReceptionController();

receptionRouter.use(authenticate);

receptionRouter.get('/management', controller.getManagement);
