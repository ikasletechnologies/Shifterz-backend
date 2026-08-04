import { Router } from 'express';
import { InventoryController } from '../controller/inventory.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { createInventorySchema, updateInventorySchema } from '../validation/inventory.validation.js';

export const inventoryRouter = Router();
const controller = new InventoryController();

inventoryRouter.use(authenticate);

// Standard Inventory Items CRUD
inventoryRouter.get('/', controller.getAllItems);
inventoryRouter.post('/', validate(createInventorySchema), controller.createItem);
inventoryRouter.put('/:id', validate(updateInventorySchema), controller.updateItem);
inventoryRouter.delete('/:id', controller.deleteItem);

// Inventory Requests & Stock Movements
inventoryRouter.get('/requests', controller.getRequests);
inventoryRouter.post('/requests', controller.createRequest);
inventoryRouter.post('/requests/:id/approve', controller.approveRequest);
inventoryRouter.post('/requests/:id/reject', controller.rejectRequest);
inventoryRouter.post('/requests/:id/dispatch', controller.dispatchRequest);
inventoryRouter.post('/requests/:id/receive', controller.receiveRequest);
inventoryRouter.get('/movements', controller.getMovements);
