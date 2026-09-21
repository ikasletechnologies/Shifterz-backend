import { Router } from 'express';
import { CustomerController } from '../controller/customer.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireAction } from '../../../middleware/auth.middleware.js';
import { requireSystemCredential } from '../../../middleware/system-auth.middleware.js';
import {
  createCustomerSchema,
  updateCustomerSchema, 
  createVehicleSchema, 
  updateVehicleSchema, 
  createWarrantySchema, 
  createReminderSchema,
  createComplaintSchema,
  createEstimateSchema
} from '../validation/customer.validation.js';

import { VehicleController } from '../../vehicle/controller/vehicle.controller.js';

export const customerRouter = Router();
const controller = new CustomerController();
const vehicleController = new VehicleController();

// D-20 — registered before customerRouter.use(authenticate) below, so this
// route never requires a human JWT.
customerRouter.post(
  '/reminders/dispatch',
  requireSystemCredential('scheduler:customers:dispatch'),
  controller.dispatchReminders
);

customerRouter.use(authenticate);

// Vehicle lookup by vehicle registration number (existing)
customerRouter.get('/vehicle/:vehicleNo', vehicleController.lookupVehicle);

// Search customers
customerRouter.get('/search', controller.searchCustomers);

// Export CSV reports
// REP-01C (D-REP1/D-REP2/D-REP7) — the Customer report duplicate flagged
// in REP-01: CustomerService.getReportCSV's own CSV switch overlaps by
// name with report.service.ts's canonical /api/reports/customer/*
// exports, but was left as-is (not merged) since it exposes a different
// type-key surface (e.g. 'customer_register') than the canonical routes.
// Gated with the existing reports:customer:export action rather than a
// new one, consistent with the canonical Customer report routes.
customerRouter.get('/reports/export', requireAction('reports:customer:export'), controller.exportCSVReport);

// RBAC-04 — D-19. requireAction() gates who may reach this route; the
// cross-franchise read itself (CustomerService.getVehicleServiceHistory
// deliberately queries with no franchise filter) and its narrow response
// shape (status only, no amounts/contact/GSTIN) are unchanged — the action
// grant is not a scope mechanism, per D-19's own text.
customerRouter.get('/vehicles/:vehicleNo/history', requireAction('vehicles:history:view'), controller.getVehicleServiceHistory);

// Customers list and register
customerRouter.get('/', controller.getCustomers);
customerRouter.post('/', validate(createCustomerSchema), controller.createCustomer);

// Aggregate report/summary
customerRouter.get('/reports/summary', requireAction('reports:customer:view'), controller.getReportsSummary);

// Specific Customer Profile endpoints
customerRouter.get('/:id', controller.getCustomerById);
customerRouter.get('/:id/dashboard', controller.getCustomerDashboard);
customerRouter.put('/:id', validate(updateCustomerSchema), controller.updateCustomer);
customerRouter.delete('/:id', controller.deleteCustomer);

// Vehicle Management for a Customer
customerRouter.get('/:id/vehicles', controller.getVehicles);
customerRouter.post('/:id/vehicles', validate(createVehicleSchema), controller.addVehicle);
customerRouter.put('/:id/vehicles/:vehicleId', validate(updateVehicleSchema), controller.updateVehicle);
customerRouter.delete('/:id/vehicles/:vehicleId', controller.deleteVehicle);

// Warranty Management
customerRouter.get('/:id/warranties', controller.getWarranties);
customerRouter.post('/:id/warranties', validate(createWarrantySchema), controller.addWarranty);

// Service Reminders
customerRouter.get('/:id/reminders', controller.getReminders);
customerRouter.post('/:id/reminders', validate(createReminderSchema), controller.addReminder);

// Referrals initiated by or referring to this customer
customerRouter.get('/:id/referrals', controller.getReferrals);

// Consolidated Customer History (Service, Invoices, Payments, Follow-ups, Callbacks, Referrals)
customerRouter.get('/:id/history', controller.getCustomerHistory);

// Complaints Management
customerRouter.get('/:id/complaints', controller.getComplaints);
customerRouter.post('/:id/complaints', validate(createComplaintSchema), controller.addComplaint);

// Estimates Management
customerRouter.get('/:id/estimates', controller.getEstimates);
customerRouter.post('/:id/estimates', validate(createEstimateSchema), controller.addEstimate);

