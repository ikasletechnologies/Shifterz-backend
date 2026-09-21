import { Router } from 'express';
import { InventoryController } from '../controller/inventory.controller.js';
import { InventoryAdjustmentController } from '../controller/inventoryAdjustment.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireRole } from '../../../middleware/auth.middleware.js';
import { createInventorySchema, updateInventorySchema, createProductRequestSchema, approveProductRequestSchema } from '../validation/inventory.validation.js';
import { createAdjustmentSchema, rejectAdjustmentSchema } from '../validation/inventoryAdjustment.validation.js';

export const inventoryRouter = Router();
const controller = new InventoryController();
const adjustmentController = new InventoryAdjustmentController();

inventoryRouter.use(authenticate);

// Standard Inventory Items CRUD
inventoryRouter.get('/', controller.getAllItems);
inventoryRouter.post('/', validate(createInventorySchema), controller.createItem);
inventoryRouter.put('/:id', validate(updateInventorySchema), controller.updateItem);
inventoryRouter.delete('/:id', controller.deleteItem);

// Inventory Requests & Stock Movements
inventoryRouter.get('/requests', controller.getRequests);
inventoryRouter.post('/requests', validate(createProductRequestSchema), controller.createRequest);
inventoryRouter.post('/requests/:id/approve', validate(approveProductRequestSchema), controller.approveRequest);
inventoryRouter.post('/requests/:id/reject', controller.rejectRequest);
inventoryRouter.post('/requests/:id/dispatch', controller.dispatchRequest);
inventoryRouter.post('/requests/:id/receive', controller.receiveRequest);
inventoryRouter.get('/movements', controller.getMovements);

// INV-04 — Stock Adjustment Requests. requireRole is a placeholder
// authority gate (SUPER_ADMIN/HQ_USER, per the locked INV-04 decision) —
// the service layer enforces the same rule independently
// (assertApproverAuthority), and this slot is exactly where a future
// requireAction() would be inserted additively once the RBAC action
// catalog decision for inventory is locked, matching the RBAC-04 pattern
// used everywhere else in this codebase.
inventoryRouter.get('/adjustments', adjustmentController.getRequests);
inventoryRouter.post('/adjustments', validate(createAdjustmentSchema), adjustmentController.createRequest);
inventoryRouter.post('/adjustments/:id/approve', requireRole('SUPER_ADMIN', 'HQ_USER'), adjustmentController.approveRequest);
inventoryRouter.post('/adjustments/:id/reject', requireRole('SUPER_ADMIN', 'HQ_USER'), validate(rejectAdjustmentSchema), adjustmentController.rejectRequest);
inventoryRouter.post('/adjustments/:id/cancel', adjustmentController.cancelRequest);
