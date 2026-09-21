import { Router } from 'express';
import { EmployeeController } from '../controller/employee.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireRole } from '../../../middleware/auth.middleware.js';
import { createEmployeeSchema, updateEmployeeSchema } from '../validation/employee.validation.js';

export const employeeRouter = Router();
export const hqEmployeeRouter = Router();
export const technicianRouter = Router();

const controller = new EmployeeController();

// Use authentication for all routes
employeeRouter.use(authenticate);
hqEmployeeRouter.use(authenticate);
technicianRouter.use(authenticate);

// Employee roster listings carry HR-visibility data (roles, franchise
// assignment, contact info) that front-line roles (technician, reception,
// billing, QC, etc.) have no business need to browse — restrict to the
// same management tier already used elsewhere in this codebase (e.g.
// job-card.service.ts's MANAGEMENT_ROLES) for who may see roster-wide data.
const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'HQ_USER', 'FRANCHISE_ADMIN', 'BRANCH_MANAGER'];

// Employees
employeeRouter.get('/', requireRole(...MANAGEMENT_ROLES), controller.getAllEmployees);
employeeRouter.get('/pending-approvals', controller.getPendingApprovals);
employeeRouter.post('/:id/approve-registration', controller.approveRegistration);
employeeRouter.post('/:id/reject-registration', controller.rejectRegistration);
employeeRouter.post('/', validate(createEmployeeSchema), controller.createEmployee);
employeeRouter.put('/:id', validate(updateEmployeeSchema), controller.updateEmployee);
employeeRouter.delete('/:id', controller.deleteEmployee);

// HQ Employees
hqEmployeeRouter.get('/', requireRole(...MANAGEMENT_ROLES), controller.getHqEmployees);

// Technicians
technicianRouter.get('/management', controller.getTechnicianManagement);
technicianRouter.get('/', controller.getTechnicians);
technicianRouter.post('/', validate(createEmployeeSchema), controller.createTechnician);
technicianRouter.delete('/:id', controller.deleteEmployee);
