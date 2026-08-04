import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { CallbackService } from '../service/callback.service.js';
import { CalendarService } from '../service/calendar.service.js';
import { logAudit } from '../../../shared/services/audit.service.js';

export class CallbackController {
  private callbackService: CallbackService;
  private calendarService: CalendarService;

  constructor() {
    this.callbackService = new CallbackService();
    this.calendarService = new CalendarService();
  }

  // ─── Callback CRUD ──────────────────────────────────────────────────────────

  /** POST /api/callbacks */
  schedule = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const createdBy = req.user?.name || req.user?.id || 'System';
      const franchiseId = req.user?.franchiseId || null;
      const callback = await this.callbackService.scheduleCallback(req.body, franchiseId, createdBy);
      await logAudit({
        module: 'CALLBACK',
        recordId: callback.id,
        action: 'CREATE',
        userId: req.user?.id || 'unknown',
        branchId: franchiseId,
        oldValue: null,
        newValue: callback,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.status(201).json(callback);
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/callbacks/my — employee's own task list */
  getMyCallbacks = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const employeeId = req.user?.id;
      if (!employeeId) return res.status(401).json({ message: 'Unauthorized' });
      const callbacks = await this.callbackService.getMyCallbacks(employeeId);
      res.json(callbacks);
    } catch (error) {
      next(error);
    }
  };

  /** GET /api/callbacks — franchise / HQ list */
  getFranchiseCallbacks = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const isHQ = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'HQ_USER';
      const franchiseId = isHQ ? null : req.user?.franchiseId || null;
      const callbacks = await this.callbackService.getFranchiseCallbacks(franchiseId);
      res.json(callbacks);
    } catch (error) {
      next(error);
    }
  };

  /** POST /api/callbacks/:id/complete */
  complete = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const completedBy = req.user?.name || req.user?.id || 'System';
      const updated = await this.callbackService.completeCallback(id, req.body, completedBy);
      await logAudit({
        module: 'CALLBACK',
        recordId: id,
        action: 'COMPLETE',
        userId: req.user?.id || 'unknown',
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: updated,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  };

  /** POST /api/callbacks/:id/reschedule */
  reschedule = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const updatedBy = req.user?.name || req.user?.id || 'System';
      const updated = await this.callbackService.rescheduleCallback(id, req.body, updatedBy);
      await logAudit({
        module: 'CALLBACK',
        recordId: id,
        action: 'RESCHEDULE',
        userId: req.user?.id || 'unknown',
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: updated,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  };

  /** DELETE /api/callbacks/:id */
  deleteCallback = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.callbackService.deleteCallback(id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  // ─── Calendar ───────────────────────────────────────────────────────────────

  /**
   * GET /api/callbacks/calendar
   * Query params:
   *   view  = "day" | "week" | "month"  (default: "week")
   *   date  = ISO date string           (default: today)
   */
  getCalendar = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const view = (['day', 'week', 'month'].includes(String(req.query.view))
        ? String(req.query.view)
        : 'week') as 'day' | 'week' | 'month';

      const refDate = req.query.date ? new Date(String(req.query.date)) : new Date();

      const isHQ = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'HQ_USER';
      const employeeId = req.user?.id || null;
      const franchiseId = isHQ ? null : req.user?.franchiseId || null;

      const events = await this.calendarService.getEvents(
        view,
        refDate,
        employeeId,
        franchiseId,
        isHQ,
      );

      res.json({ view, refDate, total: events.length, events });
    } catch (error) {
      next(error);
    }
  };

  /** POST /api/callbacks/reminders/dispatch — called by cron */
  dispatchReminders = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const windowMinutes = req.query.window ? Number(req.query.window) : 15;
      const result = await this.callbackService.dispatchReminderNotifications(windowMinutes);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
