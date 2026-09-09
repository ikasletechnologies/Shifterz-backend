import type { Response, NextFunction } from 'express';
import { PaymentsService } from '../service/payments.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { resolveDataScope } from '../../../shared/scope/dataScope.js';
import { logAudit, redactSensitive } from '../../../shared/services/audit.service.js';
import { db } from '../../../lib/db.js';

export class PaymentsController {
  constructor(private readonly service: PaymentsService = new PaymentsService()) {}

  getAllPayments = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = resolveDataScope(req.user);
      const list = await this.service.getAllPayments(scope);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  createPayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = resolveDataScope(req.user);
      const result = await this.service.createPayment(req.body, scope);
      await logAudit({
        module: "PAYMENT",
        recordId: result.id,
        action: "CREATE",
        userId: req.user?.id || "unknown",
        branchId: (result as any).franchiseId ?? null,
        oldValue: null,
        newValue: redactSensitive(result),
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  getPaymentsByCustomer = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = resolveDataScope(req.user);
      const customerId = String(req.params.customerId);
      const list = await this.service.getPaymentsByCustomer(customerId, scope);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  createRefund = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = resolveDataScope(req.user);
      const { originalPaymentId, amount, reason } = req.body;
      // D-11 — approvedBy is the authenticated actor's id, never a
      // client-supplied value or a fallback identity; any approvedBy in the
      // request body is ignored. `authenticate` unconditionally sets
      // req.user.id from the verified session before this handler runs, so
      // 'unknown' is unreachable in practice, not a real fallback identity.
      const approvedBy = req.user?.id || 'unknown';
      const oldValue = await db.payment.findUnique({ where: { id: originalPaymentId } });
      const result = await this.service.createRefund({
        originalPaymentId,
        amount: Number(amount),
        reason,
        approvedBy,
      }, scope);
      await logAudit({
        module: "PAYMENT",
        recordId: result.id,
        action: "REFUND",
        userId: req.user?.id || "unknown",
        branchId: (result as any).franchiseId ?? null,
        oldValue: redactSensitive(oldValue),
        newValue: redactSensitive(result),
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  deletePayment = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = resolveDataScope(req.user);
      const id = String(req.params.id);
      const oldValue = await db.payment.findUnique({ where: { id } });
      await this.service.deletePayment(id, scope);
      await logAudit({
        module: "PAYMENT",
        recordId: id,
        action: "DELETE",
        userId: req.user?.id || "unknown",
        branchId: (oldValue as any)?.franchiseId ?? null,
        oldValue: redactSensitive(oldValue),
        newValue: null,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json({ success: true, message: "Payment deleted" });
    } catch (error) {
      next(error);
    }
  };
}
