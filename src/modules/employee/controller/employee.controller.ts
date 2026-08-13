import type { Response, NextFunction } from 'express';
import { EmployeeService } from '../service/employee.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { db } from '../../../lib/db.js';
import { logAudit } from '../../../shared/services/audit.service.js';

export class EmployeeController {
  constructor(private readonly service: EmployeeService = new EmployeeService()) {}

  getAllEmployees = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role || "UNKNOWN";
      const userFranchiseId = req.user?.franchiseId || undefined;
      const list = await this.service.getAllEmployees(userRole, userFranchiseId);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  getHqEmployees = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const list = await this.service.getHqEmployees();
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  getTechnicians = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const list = await this.service.getTechnicians();
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  getTechnicianManagement = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role || "UNKNOWN";
      const userFranchiseId = req.user?.franchiseId || undefined;
      const result = await this.service.getTechnicianManagement(userRole, userFranchiseId, req.query as any);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  createEmployee = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role || "UNKNOWN";
      const userFranchiseId = req.user?.franchiseId || undefined;
      const result = await this.service.createEmployee(req.body, userRole, userFranchiseId, false);
      await logAudit({
        module: "EMPLOYEE",
        recordId: result.id,
        action: "CREATE",
        userId: req.user?.id || "unknown",
        branchId: userFranchiseId,
        oldValue: null,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  createTechnician = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role || "UNKNOWN";
      const userFranchiseId = req.user?.franchiseId || undefined;
      const result = await this.service.createEmployee(req.body, userRole, userFranchiseId, true);
      await logAudit({
        module: "EMPLOYEE",
        recordId: result.id,
        action: "CREATE_TECHNICIAN",
        userId: req.user?.id || "unknown",
        branchId: userFranchiseId,
        oldValue: null,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  updateEmployee = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const userRole = req.user?.role || "UNKNOWN";
      const userFranchiseId = req.user?.franchiseId || undefined;
      const oldValue = await db.employee.findUnique({ where: { id }, include: { permission: true } });
      const result = await this.service.updateEmployee(id, req.body, userRole, userFranchiseId);
      await logAudit({
        module: "EMPLOYEE",
        recordId: id,
        action: "UPDATE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteEmployee = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const userRole = req.user?.role || "UNKNOWN";
      const userFranchiseId = req.user?.franchiseId || undefined;
      const oldValue = await db.employee.findUnique({ where: { id } });
      await this.service.deleteEmployee(id, userRole, userFranchiseId);
      await logAudit({
        module: "EMPLOYEE",
        recordId: id,
        action: "DELETE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: null,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  getPendingApprovals = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role || "UNKNOWN";
      const statusFilter = req.query.status ? String(req.query.status) : undefined;
      const list = await this.service.getPendingApprovals(userRole, statusFilter);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  approveRegistration = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const userRole = req.user?.role || "UNKNOWN";
      const result = await this.service.approveRegistration(id, userRole);
      await logAudit({
        module: "EMPLOYEE",
        recordId: id,
        action: "APPROVE_REGISTRATION",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  rejectRegistration = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const userRole = req.user?.role || "UNKNOWN";
      const result = await this.service.rejectRegistration(id, userRole);
      await logAudit({
        module: "EMPLOYEE",
        recordId: id,
        action: "REJECT_REGISTRATION",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}

