import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { ServiceService } from '../service/service.service.js';
import { logAudit } from '../../../shared/services/audit.service.js';
import { db } from '../../../lib/db.js';

export class ServiceController {
  constructor(private readonly service: ServiceService = new ServiceService()) {}

  getAllServices = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const list = await this.service.getAllServices();
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  // EPB §18 / §2.13 (Finding — Section 2 sweep, Gap 1) — service creation
  // changes what every future job card / invoice defaults to; HQ-only, and
  // now audited like every other significant mutation in this codebase.
  createService = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createService(req.body);
      await logAudit({
        module: "SERVICE",
        recordId: result.id,
        action: "CREATE",
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

  updateService = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      // Pre-image captured before the mutation, same pattern
      // EmployeeController.updateEmployee already uses — a price/warranty/
      // status change here has direct operational impact, so the audit
      // entry must show what actually changed, not just that something did.
      const oldValue = await db.service.findUnique({ where: { id } });
      const result = await this.service.updateService(id, req.body);
      await logAudit({
        module: "SERVICE",
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

  deleteService = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await db.service.findUnique({ where: { id } });
      const deleted = await this.service.deleteService(id);
      await logAudit({
        module: "SERVICE",
        recordId: id,
        action: "DELETE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: deleted,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json({ success: true, message: "Service deleted successfully" });
    } catch (error) {
      next(error);
    }
  };
}
