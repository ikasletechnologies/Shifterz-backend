import { Router } from 'express';
import { DebitNoteController } from '../controller/debitNote.controller.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { createDebitNoteSchema, cancelDebitNoteSchema } from '../validation/debitNote.validation.js';

export const debitNoteRouter = Router();
const controller = new DebitNoteController();

debitNoteRouter.use(authenticate);

debitNoteRouter.post('/', validate(createDebitNoteSchema), controller.create);
debitNoteRouter.get('/:id', controller.getById);
debitNoteRouter.post('/:id/cancel', validate(cancelDebitNoteSchema), controller.cancel);
