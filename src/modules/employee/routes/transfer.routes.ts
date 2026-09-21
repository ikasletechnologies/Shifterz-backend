import { Router } from 'express';
import { TransferController } from '../controller/transfer.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireAction } from '../../../middleware/auth.middleware.js';
import { createTransferSchema, updateTransferSchema } from '../validation/transfer.validation.js';

export const transferRouter = Router();
const controller = new TransferController();

transferRouter.use(authenticate);

transferRouter.get('/', controller.getAllTransfers);
// D-16B (initiation/edit/soft-delete) remains parked — create/update/delete
// below are intentionally untouched by this task, per D-16B's own status.
transferRouter.post('/', validate(createTransferSchema), controller.createTransfer);
// RBAC-04 — D-16 only (approve/reject). requireAction() is additive:
// TransferService.approveTransfer/rejectTransfer already throw 403 for
// non-SUPER_ADMIN/HQ_USER inline — that check is unchanged and still runs.
transferRouter.post('/:id/approve', requireAction('members:transfer:approve'), controller.approveTransfer);
transferRouter.post('/:id/reject', requireAction('members:transfer:approve'), controller.rejectTransfer);
transferRouter.put('/:id', validate(updateTransferSchema), controller.updateTransfer);
transferRouter.delete('/:id', controller.deleteTransfer);
