import { Router } from 'express';
import { OutpassController } from '../controller/outpass.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { createOutpassSchema, updateOutpassSchema } from '../validation/outpass.validation.js';

export const outpassRouter = Router();
const controller = new OutpassController();

outpassRouter.use(authenticate);

outpassRouter.get('/', controller.getAllOutpasses);
outpassRouter.post('/', validate(createOutpassSchema), controller.createOutpass);
outpassRouter.put('/:id', validate(updateOutpassSchema), controller.updateOutpass);
outpassRouter.post('/:id/approve', controller.approveOutpass);
outpassRouter.post('/:id/reject', controller.rejectOutpass);
