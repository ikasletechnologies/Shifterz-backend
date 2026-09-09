import { Router } from 'express';
import { BillingController } from '../controller/billing.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireRole, requireAction } from '../../../middleware/auth.middleware.js';
import { createInvoiceSchema, updateInvoiceSchema, cancelInvoiceSchema, shareInvoiceSchema, deleteInvoiceSchema } from '../validation/billing.validation.js';

export const billingRouter = Router();
const controller = new BillingController();

billingRouter.use(authenticate);

billingRouter.get('/', controller.getAllInvoices);
billingRouter.post('/', validate(createInvoiceSchema), controller.createInvoice);
billingRouter.put('/:id', validate(updateInvoiceSchema), controller.updateInvoice);
billingRouter.post('/:id/convert', controller.convertInvoice);
// RBAC-04 — D-10. requireAction() is additive: BillingService.cancelInvoice
// still independently enforces the mandatory reason, the paid/partially-paid
// block, franchise scope via resolveDataScope(), and audit logging — none of
// that moved into this gate or was removed.
billingRouter.patch('/:id/cancel', requireAction('billing:cancel'), validate(cancelInvoiceSchema), controller.cancelInvoice);
billingRouter.post('/:id/share', validate(shareInvoiceSchema), controller.shareInvoice);
// Step 3 Item #1 — permanent deletion is an exceptional SUPER_ADMIN-only
// operation (stricter than cancellation's MANAGEMENT_ROLES tier), never an
// ordinary business action for any other role.
billingRouter.delete('/:id', requireRole('SUPER_ADMIN'), validate(deleteInvoiceSchema), controller.deleteInvoice);
