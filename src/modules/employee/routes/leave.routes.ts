import { Router } from 'express';
import { LeaveController } from '../controller/leave.controller.js';
import { authenticate, requireAction } from '../../../middleware/auth.middleware.js';

export const leaveRouter = Router();
const controller = new LeaveController();

leaveRouter.use(authenticate);

leaveRouter.post('/request', controller.requestLeave);
leaveRouter.get('/list', controller.getLeaves);
// RBAC-04 — D-15. requireAction() is additive: LeaveService.updateLeaveStatus's
// self-approval block and franchise-scope check (fixed during the D-15 lock)
// are unchanged and still run after this gate.
leaveRouter.post('/:id/approve', requireAction('leave:approve'), controller.approveLeave);
leaveRouter.post('/:id/reject', requireAction('leave:approve'), controller.rejectLeave);
