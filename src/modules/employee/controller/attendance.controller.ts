import type { Response, NextFunction } from "express";
import { AttendanceService } from "../service/attendance.service.js";
import type { AuthRequest } from "../../../middleware/auth.middleware.js";
import { logAudit } from "../../../shared/services/audit.service.js";
import { db } from "../../../lib/db.js";

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

  /** GET /attendance/today – returns today's check-in/out status for the authenticated user */
  getTodayStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id || "";
      const result = await this.service.getTodayStatus(userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  // D-14 – self-service check-in/out always acts as the authenticated actor;
  // any employeeId in the request body is ignored.
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

  // EPB A§2.13/A§17.7 – management correction of another employee's attendance
  // record (gated by the attendance:edit action / service's own scope check).
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
        device: req.headers["user-agent"],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
