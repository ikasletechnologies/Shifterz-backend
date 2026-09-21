import { Router } from 'express';
import { CreditNoteController } from '../controller/creditNote.controller.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { createCreditNoteSchema, cancelCreditNoteSchema } from '../validation/creditNote.validation.js';

export const creditNoteRouter = Router();
const controller = new CreditNoteController();

creditNoteRouter.use(authenticate);

// Role/franchise authority enforced inside GstCreditNoteService (Phase A —
// SUPER_ADMIN/HQ_USER global, FRANCHISE_ADMIN own franchise), same pattern
// as billing.service.ts's cancelInvoice/deleteInvoice — not requireRole()
// here, since eligibility also depends on the original invoice's franchise,
// which the route layer doesn't know yet.
creditNoteRouter.post('/', validate(createCreditNoteSchema), controller.create);
creditNoteRouter.get('/:id', controller.getById);
creditNoteRouter.post('/:id/cancel', validate(cancelCreditNoteSchema), controller.cancel);
