import type { Response, NextFunction } from 'express';
import { GstDebitNoteService } from '../service/gstDebitNote.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';

export class DebitNoteController {
  constructor(private readonly service: GstDebitNoteService = new GstDebitNoteService()) {}

  create = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.create(req.body, req.user);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.findById(id, req.user);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  cancel = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.cancel(id, req.body.reason, req.user);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };
}
