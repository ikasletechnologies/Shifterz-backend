import type { Response, NextFunction } from 'express';
import { LeaveService } from '../service/leave.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { logAudit } from '../../../shared/services/audit.service.js';

export class LeaveController {
  constructor(private readonly service: LeaveService = new LeaveService()) {}

  requestLeave = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const franchiseId = req.user?.franchiseId || null;
      const employeeId = req.user?.id || "";
      const result = await this.service.requestLeave({ ...req.body, employeeId, franchiseId });
      
      await logAudit({
        module: "LEAVE",
        recordId: result.id,
        action: "REQUEST_LEAVE",
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

  getLeaves = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const role = req.user?.role || "UNKNOWN";
      const franchiseId = req.user?.franchiseId || undefined;
      const list = await this.service.getLeaves(role, franchiseId);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  approveLeave = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const role = req.user?.role || "UNKNOWN";
      const franchiseId = req.user?.franchiseId || undefined;
      const result = await this.service.updateLeaveStatus(id, "Approved", role, franchiseId);

      await logAudit({
        module: "LEAVE",
        recordId: id,
        action: "APPROVE_LEAVE",
        userId: req.user?.id || "unknown",
        branchId: franchiseId || null,
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

  rejectLeave = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const role = req.user?.role || "UNKNOWN";
      const franchiseId = req.user?.franchiseId || undefined;
      const result = await this.service.updateLeaveStatus(id, "Rejected", role, franchiseId);

      await logAudit({
        module: "LEAVE",
        recordId: id,
        action: "REJECT_LEAVE",
        userId: req.user?.id || "unknown",
        branchId: franchiseId || null,
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
