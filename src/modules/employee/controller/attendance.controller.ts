import type { Response, NextFunction } from 'express';
import { AttendanceService } from '../service/attendance.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { logAudit } from '../../../shared/services/audit.service.js';
import { db } from '../../../lib/db.js';

export class AttendanceController {
  constructor(private readonly service: AttendanceService = new AttendanceService()) {}

  getAllAttendance = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role || "UNKNOWN";
      const userId = req.user?.id || "";
      const userFranchiseId = req.user?.franchiseId || undefined;
      const list = await this.service.getAllAttendance(userRole, userId, userFranchiseId);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  // D-14 — self-service check-in/out always acts as the authenticated actor;
  // any employeeId in the request body is ignored, so a request can never
  // check in/out as a different employee.
  checkIn = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.checkIn({ employeeId: req.user?.id || "" });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  checkOut = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.checkOut({ employeeId: req.user?.id || "" });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  // EPB §2.13/§17.7 (Section 2 sweep, Gap 2) — this is a management
  // correction of another employee's attendance record (gated by the
  // attendance:edit action / AttendanceService's own HQ/own-franchise
  // check below, unchanged), not routine self-service check-in/out — the
  // exact "Record Modification" case the audit trail must capture with a
  // real before/after value. Self checkIn/checkOut are deliberately left
  // unaudited: the Attendance row itself already timestamps when it
  // happened, self-check-in/out is high-volume, and duplicating that as an
  // audit entry would add noise without adding traceability.
  updateAttendance = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await db.attendance.findUnique({ where: { id } });
      const result = await this.service.updateAttendance(id, req.body, req.user);
      await logAudit({
        module: "ATTENDANCE",
        recordId: id,
        action: "UPDATE",
        userId: req.user?.id || "unknown",
        branchId: oldValue?.franchiseId ?? req.user?.franchiseId ?? null,
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
