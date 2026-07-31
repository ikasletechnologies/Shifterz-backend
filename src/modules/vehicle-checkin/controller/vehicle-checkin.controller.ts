import type { Request, Response, NextFunction } from 'express';
import { VehicleCheckinService } from '../service/vehicle-checkin.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';

export class VehicleCheckinController {
  constructor(private readonly service: VehicleCheckinService = new VehicleCheckinService()) {}

  getAll = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const list = await this.service.getAllCheckins(req.user);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const franchiseId = req.user?.franchiseId || null;
      const result = await this.service.createCheckin(req.body, franchiseId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.checkTechnicianAccess(id, req.user);
      const updated = await this.service.updateCheckin(id, req.body);
      res.json(updated);
    } catch (error) {
      next(error);
    }
  };

  checkout = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.checkTechnicianAccess(id, req.user);
      const result = await this.service.checkout(id, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  delete = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.checkTechnicianAccess(id, req.user);
      await this.service.deleteCheckin(id);
      res.json({ success: true, message: "Car entry deleted" });
    } catch (error) {
      next(error);
    }
  };
}
