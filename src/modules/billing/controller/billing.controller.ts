import type { Response, NextFunction } from 'express';
import { BillingService } from '../service/billing.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';

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
      // franchiseId is always server-derived from the authenticated user, never trusted from the client.
      const body = { ...req.body, franchiseId: req.user?.franchiseId ?? req.body.franchiseId };
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
      await this.service.deleteInvoice(id, req.user);
      res.json({ success: true, message: "Invoice deleted" });
    } catch (error) {
      next(error);
    }
  };
}
