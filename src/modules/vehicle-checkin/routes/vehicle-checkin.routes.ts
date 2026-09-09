import { Router } from 'express';
import { VehicleCheckinController } from '../controller/vehicle-checkin.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { createCheckinSchema, updateCheckinSchema, checkoutSchema } from '../validation/vehicle-checkin.validation.js';

export const vehicleCheckinRouter = Router();
const controller = new VehicleCheckinController();

vehicleCheckinRouter.use(authenticate);

vehicleCheckinRouter.get('/', controller.getAll);
vehicleCheckinRouter.post('/', validate(createCheckinSchema), controller.create);
vehicleCheckinRouter.put('/:id', validate(updateCheckinSchema), controller.update);
vehicleCheckinRouter.get('/:id/delivery-readiness', controller.getDeliveryReadiness);
vehicleCheckinRouter.put('/:id/checkout', validate(checkoutSchema), controller.checkout);
vehicleCheckinRouter.delete('/:id', controller.delete);
