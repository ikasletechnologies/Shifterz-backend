import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { FollowUpService } from '../service/followup.service.js';
import { logAudit } from '../../../shared/services/audit.service.js';

export class FollowUpController {
  private service: FollowUpService;

  constructor() {
    this.service = new FollowUpService();
  }

  /**
   * POST /api/leads/:leadId/followups
   * Add a new follow-up interaction to a lead.
   */
  addFollowUp = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const leadId = String(req.params.leadId);
      const performedBy = req.user?.name || req.user?.id || 'System';
      const performedById = req.user?.id || null;
      const franchiseId = req.user?.franchiseId || null;

      const followUp = await this.service.addFollowUp(
        leadId,
        req.body,
        performedBy,
        performedById,
        franchiseId,
      );

      await logAudit({
        module: 'LEAD_FOLLOWUP',
        recordId: followUp.id,
        action: 'CREATE',
        userId: req.user?.id || 'unknown',
        branchId: franchiseId,
        oldValue: null,
        newValue: followUp,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });

      res.status(201).json(followUp);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/leads/:leadId/followups
   * Retrieve the complete, unlimited follow-up history for a lead.
   */
  getHistory = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const leadId = String(req.params.leadId);
      const history = await this.service.getHistory(leadId);
      res.json({ total: history.length, history });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PUT /api/leads/:leadId/followups/:id
   * Correct / update an existing follow-up entry.
   */
  updateFollowUp = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await this.service['repo'].findById(id);
      const updated = await this.service.updateFollowUp(id, req.body);

      await logAudit({
        module: 'LEAD_FOLLOWUP',
        recordId: id,
        action: 'UPDATE',
        userId: req.user?.id || 'unknown',
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: updated,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });

      res.json(updated);
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/leads/followups/upcoming
   * Upcoming / pending follow-ups for the current franchise (next 7 days by default).
   */
  getUpcoming = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const franchiseId =
        req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'HQ_USER'
          ? null
          : req.user?.franchiseId || null;
      const days = req.query.days ? Number(req.query.days) : 7;
      const upcoming = await this.service.getUpcoming(franchiseId, days);
      res.json(upcoming);
    } catch (error) {
      next(error);
    }
  };
}
