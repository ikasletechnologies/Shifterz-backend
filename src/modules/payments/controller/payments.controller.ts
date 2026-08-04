import type { Request, Response, NextFunction } from 'express';
import { PaymentsService } from '../service/payments.service.js';

export class PaymentsController {
  constructor(private readonly service: PaymentsService = new PaymentsService()) {}

  getAllPayments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const list = await this.service.getAllPayments();
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  createPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createPayment(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  getPaymentsByCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const customerId = String(req.params.customerId);
      const list = await this.service.getPaymentsByCustomer(customerId);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  createRefund = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { originalPaymentId, amount, reason, approvedBy } = req.body;
      const result = await this.service.createRefund({
        originalPaymentId,
        amount: Number(amount),
        reason,
        approvedBy,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  deletePayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.deletePayment(id);
      res.json({ success: true, message: "Payment deleted" });
    } catch (error) {
      next(error);
    }
  };
}
