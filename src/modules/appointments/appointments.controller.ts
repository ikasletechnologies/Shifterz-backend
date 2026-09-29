import type { Response, NextFunction } from 'express';
import { AppointmentsService } from './appointments.service.js';
import type { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../shared/services/audit.service.js';
import { resolveDataScope, assertWithinScope } from '../../shared/scope/dataScope.js';

export class AppointmentsController {
  constructor(private readonly service: AppointmentsService = new AppointmentsService()) {}

  private getTenantFilter(req: AuthRequest) {
    if (!req.user) return {};
    const userRole = (req.user.role || '').toUpperCase().replace(/[\s_]+/g, '_');
    const isHQ = userRole === 'SUPER_ADMIN' || userRole === 'HQ_USER';
    if (isHQ) {
      // HQ may optionally filter by a specific franchise via query param
      const qf = req.query?.franchiseId ? String(req.query.franchiseId) : null;
      return qf && qf !== 'all' && qf !== 'All' ? { franchiseId: qf } : {};
    }
    // Non-HQ users are always scoped to their own franchise.
    // Sentinel prevents returning all rows when franchiseId is missing.
    return { franchiseId: req.user.franchiseId || '__NO_FRANCHISE__' };
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
      const scope = resolveDataScope(req.user);
      const appointment = await this.service.getAppointmentById(id);
      assertWithinScope(scope, appointment.franchiseId, 'Access denied to this appointment');
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
      const scope = resolveDataScope(req.user);
      const oldValue = await this.service.getAppointmentById(id);
      assertWithinScope(scope, oldValue.franchiseId, 'Access denied to modify this appointment');

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
      const scope = resolveDataScope(req.user);
      const oldValue = await this.service.getAppointmentById(id);
      assertWithinScope(scope, oldValue.franchiseId, 'Access denied to delete this appointment');

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
