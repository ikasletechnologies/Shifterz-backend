import { Router } from 'express';
import { InventoryExecutiveController } from './inventory-executive.controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';

export const inventoryExecutiveRouter = Router();
const controller = new InventoryExecutiveController();

inventoryExecutiveRouter.use(authenticate);

inventoryExecutiveRouter.get('/management', controller.getManagement);
