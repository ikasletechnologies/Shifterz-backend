import type { Request, Response, NextFunction } from 'express';
import { FranchiseService } from '../service/franchise.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { logAudit } from '../../../shared/services/audit.service.js';
import { db } from '../../../lib/db.js';

export class FranchiseController {
  constructor(private readonly service: FranchiseService = new FranchiseService()) {}

  getAllFranchises = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const list = await this.service.getAllFranchises();
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  createFranchise = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const requesterId = req.user?.id || "unknown";
      const requesterName = req.user?.name || "HQ Admin";
      const result = await this.service.createFranchise(req.body, requesterId, requesterName);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  updateFranchise = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await db.franchise.findUnique({ where: { id } });
      const result = await this.service.updateFranchise(id, req.body);
      await logAudit({
        module: "FRANCHISE",
        recordId: id,
        action: "UPDATE",
        userId: req.user?.id || "unknown",
        branchId: id,
        oldValue,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteFranchise = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await db.franchise.findUnique({ where: { id } });
      await this.service.deleteFranchise(id);
      await logAudit({
        module: "FRANCHISE",
        recordId: id,
        action: "DELETE",
        userId: req.user?.id || "unknown",
        branchId: id,
        oldValue,
        newValue: null,
        ipAddress: req.ip,
        device: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
      });
      res.json({ success: true, message: "Franchise deleted successfully" });
    } catch (error) {
      next(error);
    }
  };
}
