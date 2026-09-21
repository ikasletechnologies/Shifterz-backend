import { Router } from 'express';
import { AttendanceController } from '../controller/attendance.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireAction } from '../../../middleware/auth.middleware.js';
import { checkInSchema, checkOutSchema, updateAttendanceSchema } from '../validation/attendance.validation.js';

export const attendanceRouter = Router();
const controller = new AttendanceController();

attendanceRouter.use(authenticate);

attendanceRouter.get('/', controller.getAllAttendance);
// Self-service check-in/out are deliberately NOT gated by attendance:edit —
// D-14 treats "editing another employee's attendance" and "one's own
// check-in/out" as separate concepts, and checkIn/checkOut always resolve
// employeeId from req.user (never the request body), so self-scoping is
// already structural, not something this action grant needs to enforce.
attendanceRouter.post('/check-in', validate(checkInSchema), controller.checkIn);
attendanceRouter.put('/check-out', validate(checkOutSchema), controller.checkOut);
// RBAC-04 — D-14. requireAction() is additive: AttendanceService.
// updateAttendance's own inline scope check (SUPER_ADMIN/HQ_USER global,
// FRANCHISE_ADMIN own franchise, everyone else blocked outright) is
// unchanged and still runs after this gate.
attendanceRouter.put('/:id', requireAction('attendance:edit'), validate(updateAttendanceSchema), controller.updateAttendance);
