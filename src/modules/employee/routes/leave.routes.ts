import { Router } from 'express';
import { LeaveController } from '../controller/leave.controller.js';
import { authenticate } from '../../../middleware/auth.middleware.js';

export const leaveRouter = Router();
const controller = new LeaveController();

leaveRouter.use(authenticate);

leaveRouter.post('/request', controller.requestLeave);
leaveRouter.get('/list', controller.getLeaves);
leaveRouter.post('/:id/approve', controller.approveLeave);
leaveRouter.post('/:id/reject', controller.rejectLeave);
