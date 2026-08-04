import type { Response, NextFunction } from 'express';
import { WorkflowStageService } from '../service/workflow-stage.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';

export class WorkflowStageController {
  constructor(private readonly service: WorkflowStageService = new WorkflowStageService()) {}

  getAllStages = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const franchiseId = req.user?.franchiseId || null;
      const list = await this.service.getAllStages(franchiseId);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  createStage = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createStage(req.body, req.user);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  updateStage = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.updateStage(id, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  deleteStage = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.deleteStage(id);
      res.json({ success: true, message: "Workflow stage deleted" });
    } catch (error) {
      next(error);
    }
  };
}
