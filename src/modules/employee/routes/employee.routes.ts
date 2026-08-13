import { Router } from 'express';
import { EmployeeController } from '../controller/employee.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { createEmployeeSchema, updateEmployeeSchema } from '../validation/employee.validation.js';

export const employeeRouter = Router();
export const hqEmployeeRouter = Router();
export const technicianRouter = Router();

const controller = new EmployeeController();

// Use authentication for all routes
employeeRouter.use(authenticate);
hqEmployeeRouter.use(authenticate);
technicianRouter.use(authenticate);

// Employees
employeeRouter.get('/', controller.getAllEmployees);
employeeRouter.get('/pending-approvals', controller.getPendingApprovals);
employeeRouter.post('/:id/approve-registration', controller.approveRegistration);
employeeRouter.post('/:id/reject-registration', controller.rejectRegistration);
employeeRouter.post('/', validate(createEmployeeSchema), controller.createEmployee);
employeeRouter.put('/:id', validate(updateEmployeeSchema), controller.updateEmployee);
employeeRouter.delete('/:id', controller.deleteEmployee);

// HQ Employees
hqEmployeeRouter.get('/', controller.getHqEmployees);

// Technicians
technicianRouter.get('/management', controller.getTechnicianManagement);
technicianRouter.get('/', controller.getTechnicians);
technicianRouter.post('/', validate(createEmployeeSchema), controller.createTechnician);
technicianRouter.delete('/:id', controller.deleteEmployee);
