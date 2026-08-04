import { Router } from 'express';
import { ServiceController } from '../controller/service.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireRole } from '../../../middleware/auth.middleware.js';
import { createServiceSchema, updateServiceSchema } from '../validation/service.validation.js';

export const serviceRouter = Router();
const controller = new ServiceController();

// Use authentication for all routes
serviceRouter.use(authenticate);

// All users can read active services
serviceRouter.get('/', controller.getAllServices);

// Only HQ may create, modify, or delete services (PRD §Service Master Business Rules)
serviceRouter.post('/', requireRole("SUPER_ADMIN", "HQ_USER"), validate(createServiceSchema), controller.createService);
serviceRouter.put('/:id', requireRole("SUPER_ADMIN", "HQ_USER"), validate(updateServiceSchema), controller.updateService);
serviceRouter.delete('/:id', requireRole("SUPER_ADMIN", "HQ_USER"), controller.deleteService);

