import { Router } from 'express';
import { CustomerController } from '../controller/customer.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
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

customerRouter.use(authenticate);

// Vehicle lookup by vehicle registration number (existing)
customerRouter.get('/vehicle/:vehicleNo', vehicleController.lookupVehicle);

// Search customers
customerRouter.get('/search', controller.searchCustomers);

// Export CSV reports
customerRouter.get('/reports/export', controller.exportCSVReport);

// Dispatch reminders
customerRouter.post('/reminders/dispatch', controller.dispatchReminders);

// Vehicle Service History cross-franchise
customerRouter.get('/vehicles/:vehicleNo/history', controller.getVehicleServiceHistory);

// Customers list and register
customerRouter.get('/', controller.getCustomers);
customerRouter.post('/', validate(createCustomerSchema), controller.createCustomer);

// Aggregate report/summary
customerRouter.get('/reports/summary', controller.getReportsSummary);

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

