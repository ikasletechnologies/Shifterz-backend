import type { Response, NextFunction } from 'express';
import { InventoryAdjustmentService } from '../service/inventoryAdjustment.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { logAudit } from '../../../shared/services/audit.service.js';
import { db } from '../../../lib/db.js';

export class InventoryAdjustmentController {
  constructor(private readonly service: InventoryAdjustmentService = new InventoryAdjustmentService()) {}

  createRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const request = await this.service.createRequest(req.body, req.user);
      await logAudit({
        module: "INVENTORY_ADJUSTMENT",
        recordId: request.id,
        action: "REQUEST_ADJUSTMENT",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: request,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(request);
    } catch (error) {
      next(error);
    }
  };

  getRequests = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const list = await this.service.getRequests(req.user);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  approveRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await db.inventoryAdjustmentRequest.findUnique({ where: { id } });
      const request = await this.service.approveRequest(id, req.user || {});
      await logAudit({
        module: "INVENTORY_ADJUSTMENT",
        recordId: id,
        action: "APPROVE_ADJUSTMENT",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: request,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(request);
    } catch (error) {
      next(error);
    }
  };

  rejectRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await db.inventoryAdjustmentRequest.findUnique({ where: { id } });
      const request = await this.service.rejectRequest(id, req.body.rejectionNote, req.user || {});
      await logAudit({
        module: "INVENTORY_ADJUSTMENT",
        recordId: id,
        action: "REJECT_ADJUSTMENT",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: request,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(request);
    } catch (error) {
      next(error);
    }
  };

  cancelRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await db.inventoryAdjustmentRequest.findUnique({ where: { id } });
      const request = await this.service.cancelRequest(id, req.user || {});
      await logAudit({
        module: "INVENTORY_ADJUSTMENT",
        recordId: id,
        action: "CANCEL_ADJUSTMENT",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: request,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(request);
    } catch (error) {
      next(error);
    }
  };
}
