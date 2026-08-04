import type { Response, NextFunction } from 'express';
import { WorkshopService } from '../service/workshop.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { dispatchWorkshopReminders } from '../../../shared/services/notification.service.js';

export class WorkshopController {
  constructor(private readonly service: WorkshopService = new WorkshopService()) {}

  getDashboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      
      const summary = await this.service.getDashboardSummary(req.user.id);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  };

  getFranchiseDashboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role || "UNKNOWN";
      // HQ users can specify franchiseId via query; Franchise admins are locked to their own franchiseId.
      let franchiseId = req.user?.franchiseId || null;
      if (userRole === "SUPER_ADMIN" || userRole === "HQ_USER") {
        if (req.query.franchiseId) {
          franchiseId = String(req.query.franchiseId);
        }
      }

      if (!franchiseId) {
        res.status(400).json({ error: "Franchise ID is required" });
        return;
      }

      const summary = await this.service.getFranchiseDashboard(franchiseId);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  };

  // ─── Reminders Sweep (10.13 — Upcoming Delivery / Delayed Jobs) ───────────
  // Manually-triggered (no cron infra in this backend); intended to be hit
  // periodically by an external scheduler, same convention as
  // POST /api/customers/dispatch-reminders.

  dispatchReminders = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await dispatchWorkshopReminders();
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  };
}
