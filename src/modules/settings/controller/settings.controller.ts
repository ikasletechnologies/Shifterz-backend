import type { Request, Response, NextFunction } from 'express';
import { SettingsService } from '../service/settings.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { logAudit, redactSensitive } from '../../../shared/services/audit.service.js';

export class SettingsController {
  constructor(private readonly service: SettingsService = new SettingsService()) {}

  getSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await this.service.getSettings();
      res.json(settings);
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const oldValue = await this.service.getSettings();
      const result = await this.service.updateSettings(req.body);
      // D-12 — settings are global only (no franchise-level settings exist),
      // so there is no meaningful branchId to attach beyond the actor's own.
      await logAudit({
        module: "SETTINGS",
        recordId: result.id,
        action: "UPDATE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: redactSensitive(oldValue),
        newValue: redactSensitive(result),
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
