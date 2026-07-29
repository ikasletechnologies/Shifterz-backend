import { Router } from 'express';
import { CustomerController } from '../controller/customer.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { createCustomerSchema } from '../validation/customer.validation.js';

import { VehicleController } from '../../vehicle/controller/vehicle.controller.js';

export const customerRouter = Router();
const controller = new CustomerController();
const vehicleController = new VehicleController();

customerRouter.use(authenticate);

customerRouter.get('/vehicle/:vehicleNo', vehicleController.lookupVehicle);
customerRouter.get('/', controller.getCustomers);
customerRouter.post('/', validate(createCustomerSchema), controller.createCustomer);
customerRouter.delete('/:id', controller.deleteCustomer);
