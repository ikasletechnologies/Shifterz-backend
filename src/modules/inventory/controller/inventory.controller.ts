import type { Response, NextFunction } from 'express';
import { InventoryService } from '../service/inventory.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { logAudit } from '../../../shared/services/audit.service.js';
import { db } from '../../../lib/db.js';

export class InventoryController {
  constructor(private readonly service: InventoryService = new InventoryService()) {}

  getAllItems = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role || "UNKNOWN";
      const userFranchiseId = req.user?.franchiseId || undefined;
      const list = await this.service.getAllItems(userRole, userFranchiseId);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  createItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id || "unknown";
      const userRole = req.user?.role || "UNKNOWN";
      const userFranchiseId = req.user?.franchiseId || undefined;
      const result = await this.service.createItem(req.body, userId, userRole, userFranchiseId);
      await logAudit({
        module: "INVENTORY",
        recordId: result.id,
        action: "CREATE",
        userId,
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

  updateItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const userId = req.user?.id || "unknown";
      const oldValue = await db.inventory.findUnique({ where: { id } });
      const result = await this.service.updateItem(id, req.body, userId);
      await logAudit({
        module: "INVENTORY",
        recordId: id,
        action: "UPDATE",
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

  deleteItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const userId = req.user?.id || "unknown";
      const oldValue = await db.inventory.findUnique({ where: { id } });
      await this.service.deleteItem(id);
      await logAudit({
        module: "INVENTORY",
        recordId: id,
        action: "DELETE",
        userId,
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

  // ═══════════════════════════════════════════════════════════════
  // INVENTORY REQUESTS FLOWS
  // ═══════════════════════════════════════════════════════════════

  createRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const franchiseId = req.user?.franchiseId || null;
      const request = await this.service.createRequest(req.body, franchiseId);
      await logAudit({
        module: "INVENTORY",
        recordId: request.id,
        action: "REQUEST_STOCK",
        userId: req.user?.id || "unknown",
        branchId: franchiseId,
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
      const role = req.user?.role || "UNKNOWN";
      const franchiseId = req.user?.franchiseId || undefined;
      const list = await this.service.getRequests(role, franchiseId);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  approveRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role || "UNKNOWN";
      if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER") {
        res.status(403).json({ error: "Only Headquarters may approve product requests." });
        return;
      }
      const id = String(req.params.id);
      const oldValue = await db.inventoryRequest.findUnique({ where: { id } });
      const request = await this.service.approveRequest(id, req.body);
      await logAudit({
        module: "INVENTORY",
        recordId: id,
        action: "APPROVE_STOCK",
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
      const userRole = req.user?.role || "UNKNOWN";
      if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER") {
        res.status(403).json({ error: "Only Headquarters may reject product requests." });
        return;
      }
      const id = String(req.params.id);
      const oldValue = await db.inventoryRequest.findUnique({ where: { id } });
      const request = await this.service.rejectRequest(id);
      await logAudit({
        module: "INVENTORY",
        recordId: id,
        action: "REJECT_STOCK",
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

  dispatchRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role || "UNKNOWN";
      if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER") {
        res.status(403).json({ error: "Only Headquarters may dispatch product requests." });
        return;
      }
      const id = String(req.params.id);
      const oldValue = await db.inventoryRequest.findUnique({ where: { id } });
      const request = await this.service.dispatchRequest(id);
      await logAudit({
        module: "INVENTORY",
        recordId: id,
        action: "DISPATCH_STOCK",
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

  receiveRequest = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const userId = req.user?.id || "unknown";
      const oldValue = await db.inventoryRequest.findUnique({ where: { id } });
      const request = await this.service.receiveRequest(id, userId);
      await logAudit({
        module: "INVENTORY",
        recordId: id,
        action: "RECEIVE_STOCK",
        userId,
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

  getMovements = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const list = await this.service.getMovements(req.query.itemId ? String(req.query.itemId) : undefined);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };
}
