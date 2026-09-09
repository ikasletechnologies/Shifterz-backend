import type { Response, NextFunction } from 'express';
import { BillingService } from '../service/billing.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { resolveDataScope } from '../../../shared/scope/dataScope.js';

export class BillingController {
  constructor(private readonly service: BillingService = new BillingService()) {}

  private resolveScope(req: AuthRequest): string | null | undefined {
    const role = req.user?.role || '';
    if (role === 'SUPER_ADMIN' || role === 'HQ_USER') {
      return req.query.franchiseId ? String(req.query.franchiseId) : undefined;
    }
    return req.user?.franchiseId ?? undefined;
  }

  getAllInvoices = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const franchiseId = this.resolveScope(req);
      const list = await this.service.getAllInvoices(franchiseId);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  createInvoice = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // franchiseId is always server-derived from the authenticated user.
      // Only an unrestricted (SUPER_ADMIN/HQ_USER) actor may direct it at an
      // arbitrary franchise via the body — any other actor, including an
      // hqControlled non-admin employee, is pinned to their own franchiseId
      // regardless of what the body claims.
      const scope = resolveDataScope(req.user);
      const franchiseId = scope.unrestricted ? (req.body.franchiseId ?? null) : scope.franchiseId;
      const body = { ...req.body, franchiseId };
      const result = await this.service.createInvoice(body, req.user);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  updateInvoice = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.updateInvoice(id, req.body, req.user);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  convertInvoice = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { type, amount, gst, discount, buyerState, manualGstRate, manualHsnSac } = req.body;
      const result = await this.service.convertInvoice(id, type, { amount, gst, discount, buyerState, manualGstRate, manualHsnSac }, req.user);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  cancelInvoice = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.cancelInvoice(id, req.body.reason, req.user);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  shareInvoice = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.shareInvoice(id, req.body.channel, req.user);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteInvoice = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.deleteInvoice(id, req.body.reason, req.user);
      res.json({ success: true, message: "Invoice permanently deleted" });
    } catch (error) {
      next(error);
    }
  };
}
