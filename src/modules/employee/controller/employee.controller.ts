import type { Response, NextFunction } from 'express';
import { EmployeeService } from '../service/employee.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';

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
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  updateEmployee = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.updateEmployee(id, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteEmployee = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.deleteEmployee(id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };
}
