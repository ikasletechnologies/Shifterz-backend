import { Router } from 'express';
import { PaymentsController } from '../controller/payments.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireAction } from '../../../middleware/auth.middleware.js';
import { createPaymentSchema } from '../validation/payments.validation.js';

export const paymentsRouter = Router();
const controller = new PaymentsController();

paymentsRouter.use(authenticate);

paymentsRouter.get('/', controller.getAllPayments);
paymentsRouter.get('/customer/:customerId', controller.getPaymentsByCustomer);
paymentsRouter.post('/', validate(createPaymentSchema), controller.createPayment);
// RBAC-04 — D-11. requireAction() is additive: approvedBy is still derived
// from req.user (not client-supplied — see D-11's own gap-closure note),
// original-payment validation and franchise scope are unchanged.
paymentsRouter.post('/refund', requireAction('payments:refund'), controller.createRefund);
paymentsRouter.delete('/:id', controller.deletePayment);
