import type { Response, NextFunction } from "express";
import { WarrantyService } from "../service/warranty.service.js";
import type { AuthRequest } from "../../../middleware/auth.middleware.js";
import { logAudit } from "../../../shared/services/audit.service.js";
import { db } from "../../../lib/db.js";

const service = new WarrantyService();

// WTY-01A (Fix 3) — converted from plain Express Request to the
// established AuthRequest type: req.user was never read anywhere in this
// controller before, and every error response used `error.status` (always
// undefined on this codebase's ApiError-based errors, which set
// `.statusCode` — every ValidationError/NotFoundError thrown here was
// silently returned as a generic 500). Switched to `next(error)` + the
// shared errorMiddleware, the same pattern every other controller in this
// codebase uses, which fixes both issues at once.
export class WarrantyController {
  getWarranties = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const customerId = req.query.customerId as string | undefined;
      const vehicleNo = req.query.vehicleNo as string | undefined;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;

      const warranties = await service.getAllWarranties({ customerId, vehicleNo, status, search }, req.user);
      res.json(warranties);
    } catch (error) {
      next(error);
    }
  };

  getWarrantyById = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const warranty = await service.getWarrantyById(id, req.user);
      res.json(warranty);
    } catch (error) {
      next(error);
    }
  };

  createWarranty = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const warranty = await service.createWarranty(req.body, req.user);
      await logAudit({
        module: "WARRANTY",
        recordId: warranty.id,
        action: "CREATE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: warranty,
        ipAddress: req.ip,
        device: req.headers["user-agent"],
      });
      res.status(201).json(warranty);
    } catch (error) {
      next(error);
    }
  };

  updateWarranty = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const oldValue = await db.warranty.findUnique({ where: { id } });
      const updated = await service.updateWarranty(id, req.body, req.user);
      await logAudit({
        module: "WARRANTY",
        recordId: id,
        action: "UPDATE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: updated,
        ipAddress: req.ip,
        device: req.headers["user-agent"],
      });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  };

  addClaim = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const oldValue = await db.warranty.findUnique({ where: { id } });
      const updated = await service.addClaim(id, req.body, req.user);
      await logAudit({
        module: "WARRANTY",
        recordId: id,
        action: "CLAIM",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: updated,
        ipAddress: req.ip,
        device: req.headers["user-agent"],
      });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  };

  generateFromInvoice = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const invoiceId = req.params.invoiceId as string;
      const warranties = await service.generateFromInvoice(invoiceId, req.user);
      await logAudit({
        module: "WARRANTY",
        recordId: invoiceId,
        action: "GENERATE_FROM_INVOICE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: warranties,
        ipAddress: req.ip,
        device: req.headers["user-agent"],
      });
      res.status(201).json(warranties);
    } catch (error) {
      next(error);
    }
  };

  deleteWarranty = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id as string;
      const oldValue = await db.warranty.findUnique({ where: { id } });
      const result = await service.deleteWarranty(id, req.user);
      await logAudit({
        module: "WARRANTY",
        recordId: id,
        action: "DELETE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: null,
        ipAddress: req.ip,
        device: req.headers["user-agent"],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
