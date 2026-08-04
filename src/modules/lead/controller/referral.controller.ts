import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { ReferralService } from '../service/referral.service.js';
import { logAudit } from '../../../shared/services/audit.service.js';

export class ReferralController {
  private service: ReferralService;

  constructor() {
    this.service = new ReferralService();
  }

  create = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const franchiseId = req.user?.franchiseId || null;
      const referral = await this.service.createReferral(req.body, franchiseId);
      await logAudit({
        module: 'LEAD',
        recordId: referral?.id || 'unknown',
        action: 'CREATE',
        userId: req.user?.id || 'unknown',
        branchId: franchiseId,
        oldValue: null,
        newValue: referral,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.status(201).json(referral);
    } catch (error) {
      next(error);
    }
  };

  getAll = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const isHQ = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'HQ_USER';
      const franchiseId = isHQ ? null : req.user?.franchiseId || null;
      const referrals = await this.service.getReferrals(franchiseId);
      res.json(referrals);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const referral = await this.service.getReferralById(id);
      if (!referral) return res.status(404).json({ message: 'Referral not found' });
      res.json(referral);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await this.service.getReferralById(id);
      const referral = await this.service.updateReferral(id, req.body);
      await logAudit({
        module: 'LEAD',
        recordId: id,
        action: 'UPDATE',
        userId: req.user?.id || 'unknown',
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: referral,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(referral);
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.deleteReferral(id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };
}
