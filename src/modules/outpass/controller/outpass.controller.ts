import type { Response, NextFunction } from 'express';
import { OutpassService } from '../service/outpass.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { logAudit } from '../../../shared/services/audit.service.js';
import { db } from '../../../lib/db.js';

export class OutpassController {
  constructor(private readonly service: OutpassService = new OutpassService()) {}

  getAllOutpasses = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const role = req.user?.role || "UNKNOWN";
      const franchiseId = req.user?.franchiseId || undefined;
      const list = await this.service.getAllOutpasses(role, franchiseId);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  createOutpass = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const franchiseId = req.user?.franchiseId || null;
      const result = await this.service.createOutpass(req.body, franchiseId);
      await logAudit({
        module: "OUTPASS",
        recordId: result.id,
        action: "CREATE",
        userId: req.user?.id || "unknown",
        branchId: franchiseId,
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

  updateOutpass = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await db.outPass.findUnique({ where: { id } });
      const result = await this.service.updateOutpass(id, req.body);
      await logAudit({
        module: "OUTPASS",
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

  approveOutpass = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const userId = req.user?.id || "unknown";
      const userName = req.user?.name || "HQ Admin";
      const oldValue = await db.outPass.findUnique({ where: { id } });
      const result = await this.service.approveOutpass(id, userId, userName);
      await logAudit({
        module: "OUTPASS",
        recordId: id,
        action: "APPROVE_OUTPASS",
        userId,
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

  rejectOutpass = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await db.outPass.findUnique({ where: { id } });
      const result = await this.service.rejectOutpass(id);
      await logAudit({
        module: "OUTPASS",
        recordId: id,
        action: "REJECT_OUTPASS",
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
}
