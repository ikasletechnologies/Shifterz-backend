import { Router } from 'express';
import { ReferralController } from '../controller/referral.controller.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { createReferralSchema, updateReferralSchema } from '../validation/referral.validation.js';

export const referralRouter = Router();
const controller = new ReferralController();

referralRouter.use(authenticate);

referralRouter.get('/', controller.getAll);
referralRouter.post('/', validate(createReferralSchema), controller.create);
referralRouter.get('/:id', controller.getById);
referralRouter.put('/:id', validate(updateReferralSchema), controller.update);
referralRouter.delete('/:id', controller.delete);
