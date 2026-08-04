import type { Response, NextFunction } from 'express';
import { AppointmentsService } from './appointments.service.js';
import type { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../shared/services/audit.service.js';

export class AppointmentsController {
  constructor(private readonly service: AppointmentsService = new AppointmentsService()) {}

  private getTenantFilter(req: AuthRequest) {
    let tenantFilter: any = {};
    if (req.user) {
      if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "HQ_USER" && req.user.franchiseId) {
        tenantFilter = { franchiseId: req.user.franchiseId };
      }
    }
    return tenantFilter;
  }

  getAppointments = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const tenantFilter = this.getTenantFilter(req);
      const list = await this.service.getAppointments(tenantFilter);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  getAppointmentById = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const appointment = await this.service.getAppointmentById(id);

      // Tenant isolation check
      if (req.user && req.user.role !== "SUPER_ADMIN" && req.user.role !== "HQ_USER" && req.user.franchiseId) {
        if (appointment.franchiseId !== req.user.franchiseId) {
          return res.status(403).json({ error: "Access denied to this appointment" });
        }
      }

      res.json(appointment);
    } catch (error) {
      next(error);
    }
  };

  createAppointment = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const franchiseId = req.user?.franchiseId || null;
      const appointment = await this.service.createAppointment(req.body, franchiseId);

      await logAudit({
        module: "APPOINTMENT",
        recordId: appointment.id,
        action: "CREATE",
        userId: req.user?.id || "unknown",
        branchId: franchiseId,
        oldValue: null,
        newValue: appointment,
        ipAddress: req.ip,
        device: req.headers['user-agent']
      });

      res.json(appointment);
    } catch (error) {
      next(error);
    }
  };

  updateAppointment = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await this.service.getAppointmentById(id);

      // Tenant isolation check
      if (req.user && req.user.role !== "SUPER_ADMIN" && req.user.role !== "HQ_USER" && req.user.franchiseId) {
        if (oldValue.franchiseId !== req.user.franchiseId) {
          return res.status(403).json({ error: "Access denied to modify this appointment" });
        }
      }

      const updated = await this.service.updateAppointment(id, req.body);

      await logAudit({
        module: "APPOINTMENT",
        recordId: id,
        action: "UPDATE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: updated,
        ipAddress: req.ip,
        device: req.headers['user-agent']
      });

      res.json(updated);
    } catch (error) {
      next(error);
    }
  };

  deleteAppointment = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await this.service.getAppointmentById(id);

      // Tenant isolation check
      if (req.user && req.user.role !== "SUPER_ADMIN" && req.user.role !== "HQ_USER" && req.user.franchiseId) {
        if (oldValue.franchiseId !== req.user.franchiseId) {
          return res.status(403).json({ error: "Access denied to delete this appointment" });
        }
      }

      const deleted = await this.service.deleteAppointment(id);

      await logAudit({
        module: "APPOINTMENT",
        recordId: id,
        action: "DELETE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: null,
        ipAddress: req.ip,
        device: req.headers['user-agent']
      });

      res.json(deleted);
    } catch (error) {
      next(error);
    }
  };
}
