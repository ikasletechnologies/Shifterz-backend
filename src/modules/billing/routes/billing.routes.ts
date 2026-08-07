import { Router } from 'express';
import { BillingController } from '../controller/billing.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { createInvoiceSchema, updateInvoiceSchema, cancelInvoiceSchema, shareInvoiceSchema } from '../validation/billing.validation.js';

export const billingRouter = Router();
const controller = new BillingController();

billingRouter.use(authenticate);

billingRouter.get('/', controller.getAllInvoices);
billingRouter.post('/', validate(createInvoiceSchema), controller.createInvoice);
billingRouter.put('/:id', validate(updateInvoiceSchema), controller.updateInvoice);
billingRouter.post('/:id/convert', controller.convertInvoice);
billingRouter.patch('/:id/cancel', validate(cancelInvoiceSchema), controller.cancelInvoice);
billingRouter.post('/:id/share', validate(shareInvoiceSchema), controller.shareInvoice);
billingRouter.delete('/:id', controller.deleteInvoice);
