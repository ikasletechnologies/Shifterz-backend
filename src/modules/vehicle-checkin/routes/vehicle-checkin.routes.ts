import { Router } from 'express';
import { VehicleCheckinController } from '../controller/vehicle-checkin.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireRole } from '../../../middleware/auth.middleware.js';
import { createCheckinSchema, updateCheckinSchema, checkoutSchema } from '../validation/vehicle-checkin.validation.js';

export const vehicleCheckinRouter = Router();
const controller = new VehicleCheckinController();

vehicleCheckinRouter.use(authenticate);

// EPB 2.6 — deleting a check-in cascades to its Job Card and OutPass
// records; restricted to the same management tier already used elsewhere
// in this codebase (e.g. employee.routes.ts's MANAGEMENT_ROLES) for
// destructive/record-protection-sensitive actions.
const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'HQ_USER', 'FRANCHISE_ADMIN', 'BRANCH_MANAGER'];

vehicleCheckinRouter.get('/', controller.getAll);
vehicleCheckinRouter.post('/', validate(createCheckinSchema), controller.create);
vehicleCheckinRouter.put('/:id', validate(updateCheckinSchema), controller.update);
vehicleCheckinRouter.get('/:id/delivery-readiness', controller.getDeliveryReadiness);
vehicleCheckinRouter.put('/:id/checkout', validate(checkoutSchema), controller.checkout);
vehicleCheckinRouter.delete('/:id', requireRole(...MANAGEMENT_ROLES), controller.delete);
