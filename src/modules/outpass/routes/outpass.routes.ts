import { Router } from 'express';
import { OutpassController } from '../controller/outpass.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireAction } from '../../../middleware/auth.middleware.js';
import { createOutpassSchema, updateOutpassSchema } from '../validation/outpass.validation.js';

export const outpassRouter = Router();
const controller = new OutpassController();

outpassRouter.use(authenticate);

outpassRouter.get('/', controller.getAllOutpasses);
outpassRouter.post('/', validate(createOutpassSchema), controller.createOutpass);
outpassRouter.put('/:id', validate(updateOutpassSchema), controller.updateOutpass);
// RBAC-04 — D-09. Reject shares the same authorization as approve (one
// decision on a pending outpass), same pattern already used for D-15/D-16's
// approve+reject pairs. requireAction() is additive here: the
// job/QC/invoice/payment delivery-prerequisite checks already happen at
// outpass *creation* (createOutpass), not re-run here — this gate only
// controls who may act on an outpass that already passed those checks.
outpassRouter.post('/:id/approve', requireAction('outpass:approve'), controller.approveOutpass);
outpassRouter.post('/:id/reject', requireAction('outpass:approve'), controller.rejectOutpass);
