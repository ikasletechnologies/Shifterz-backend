import type { Response, NextFunction } from 'express';
import { BillingExecutiveService } from './billing-executive.service.js';
import type { AuthRequest } from '../../middleware/auth.middleware.js';

export class BillingExecutiveController {
  constructor(private readonly service: BillingExecutiveService = new BillingExecutiveService()) {}

  getManagement = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userRole = req.user?.role || "UNKNOWN";
      const userFranchiseId = req.user?.franchiseId || undefined;
      const result = await this.service.getManagement(userRole, userFranchiseId, req.query as any);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
