import type { Response, NextFunction } from 'express';
import { VehicleCheckinService } from '../service/vehicle-checkin.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { logAudit } from '../../../shared/services/audit.service.js';

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

      // Rule 10: Record in Audit Trail
      await logAudit({
        module: 'VEHICLE_CHECKIN',
        recordId: result.id,
        action: 'CHECK_IN',
        userId: req.user?.id || 'unknown',
        branchId: franchiseId,
        oldValue: null,
        newValue: {
          id: result.id,
          vehicle: result.vehicle,
          customer: result.customer,
          jobCardId: result.jobCardId,
          inTime: result.inTime,
          status: result.status,
        },
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });

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

      // Rule 10: Record in Audit Trail
      await logAudit({
        module: 'VEHICLE_CHECKIN',
        recordId: id,
        action: 'UPDATE',
        userId: req.user?.id || 'unknown',
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: req.body,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });

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

      // Rule 10: Record in Audit Trail
      await logAudit({
        module: 'VEHICLE_CHECKIN',
        recordId: id,
        action: 'CHECK_OUT',
        userId: req.user?.id || 'unknown',
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: {
          id: result.id,
          vehicle: result.vehicle,
          customer: result.customer,
          checkOutAt: result.checkOutAt,
          checkOutByName: result.checkOutByName,
          status: result.status,
        },
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });

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

      await logAudit({
        module: 'VEHICLE_CHECKIN',
        recordId: id,
        action: 'DELETE',
        userId: req.user?.id || 'unknown',
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: null,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });

      res.json({ success: true, message: "Car entry deleted" });
    } catch (error) {
      next(error);
    }
  };
}
