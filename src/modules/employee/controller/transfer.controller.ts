import type { Response, NextFunction } from 'express';
import { TransferService } from '../service/transfer.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { logAudit, redactSensitive } from '../../../shared/services/audit.service.js';
import { db } from '../../../lib/db.js';

export class TransferController {
  constructor(private readonly service: TransferService = new TransferService()) {}

  getAllTransfers = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const list = await this.service.getAllTransfers();
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  createTransfer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const username = req.user?.id || ""; // Usually we extract username, fallback to id
      const role = req.user?.role || "UNKNOWN";
      const result = await this.service.createTransfer(req.body, username, role);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  approveTransfer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const role = req.user?.role || "UNKNOWN";
      // EPB 2.13 — the request itself (a MemberTransferRequest row) may
      // carry a plaintext password field for a not-yet-provisioned new
      // member; redactSensitive strips it before either value reaches the
      // audit log.
      const oldValue = await db.memberTransferRequest.findUnique({ where: { id } });
      const result = await this.service.approveTransfer(id, role);
      const newValue = await db.memberTransferRequest.findUnique({ where: { id } });

      await logAudit({
        module: "MEMBER_TRANSFER",
        recordId: id,
        action: "APPROVE",
        userId: req.user?.id || "unknown",
        branchId: oldValue?.toFranchiseId || null,
        oldValue: redactSensitive(oldValue),
        newValue: redactSensitive({ ...newValue, provisionedEmployeeId: result.employee?.id ?? null }),
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });

      // The "new member" branch also provisions an Employee, same as
      // EmployeeController.createEmployee's CREATE audit entry; that path
      // must not go unaudited just because it was reached via transfer
      // approval rather than a direct create request.
      if (result.employee) {
        await logAudit({
          module: "EMPLOYEE",
          recordId: result.employee.id,
          action: "CREATE_FROM_TRANSFER",
          userId: req.user?.id || "unknown",
          branchId: result.employee.franchiseId || null,
          oldValue: null,
          newValue: redactSensitive(result.employee),
          ipAddress: req.ip,
          device: req.headers['user-agent'],
        });
      }
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  rejectTransfer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const role = req.user?.role || "UNKNOWN";
      const oldValue = await db.memberTransferRequest.findUnique({ where: { id } });
      const result = await this.service.rejectTransfer(id, role);
      const newValue = await db.memberTransferRequest.findUnique({ where: { id } });

      await logAudit({
        module: "MEMBER_TRANSFER",
        recordId: id,
        action: "REJECT",
        userId: req.user?.id || "unknown",
        branchId: oldValue?.toFranchiseId || null,
        oldValue: redactSensitive(oldValue),
        newValue: redactSensitive(newValue),
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  updateTransfer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.updateTransfer(id, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteTransfer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.deleteTransfer(id);
      res.json({ success: true, message: "Deleted successfully" });
    } catch (error) {
      next(error);
    }
  };
}
