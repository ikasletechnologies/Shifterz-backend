import type { Response, NextFunction } from 'express';
import { InventoryExecutiveService } from './inventory-executive.service.js';
import type { AuthRequest } from '../../middleware/auth.middleware.js';

export class InventoryExecutiveController {
  constructor(private readonly service: InventoryExecutiveService = new InventoryExecutiveService()) {}

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
