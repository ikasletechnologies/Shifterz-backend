import type { Request, Response, NextFunction } from 'express';
import { JobCardService } from '../service/job-card.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { logger } from '../../../shared/logger/logger.js';

export class JobCardController {
  constructor(private readonly service: JobCardService = new JobCardService()) {}

  getJobs = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      let filter: any = {};
      if (req.user) {
        const userRole = (req.user.role || "").toUpperCase().replace(/[\s_]+/g, "_");
        if (userRole === "TECHNICIAN") {
          const conditions: any[] = [];
          if (req.user.id) {
            conditions.push({ technicianId: req.user.id });
          }
          if (req.user.name && req.user.name.trim() !== "") {
            conditions.push({ technician: { equals: req.user.name.trim(), mode: "insensitive" } });
          }
          if (conditions.length > 0) {
            filter = { OR: conditions };
          } else {
            filter = { id: "__NO_MATCH__" };
          }
        } else if (
          userRole === "QUALITY_INSPECTOR" ||
          userRole === "QUALITY_INSPECTION" ||
          userRole === "QC_INSPECTOR" ||
          userRole === "QC" ||
          userRole === "QUALITY_ASSURANCE"
        ) {
          filter = {
            status: { in: ["Waiting QC", "Inspecting", "QC Passed", "QC Failed", "Rework", "Ready For Billing"] }
          };
        } else if (
          userRole.includes("BILLING") ||
          userRole.includes("ACCOUNTANT")
        ) {
          filter = {
            status: { in: ["Ready For Billing", "QC Passed", "Delivered", "Out"] }
          };
        }
      }

      const list = await this.service.getJobs(filter);
      
      logger.info(`[Jobs API] User Role: ${req.user?.role}, Filter: ${JSON.stringify(filter)}, Results: ${list.length}`);
      
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  createJob = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createJob(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  updateJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.checkTechnicianAccess(id, req.user);
      const result = await this.service.updateJob(id, req.body, req.user);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  submitChecklist = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.submitChecklist(id, req.body.checklist);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  uploadQcPhotos = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        res.status(400).json({ error: "No files uploaded" });
        return;
      }
      const urls = files.map((f) => `/uploads/${f.filename}`);
      const result = await this.service.appendQcPhotos(id, urls);
      res.json({ photos: result.qcPhotos });
    } catch (error) {
      next(error);
    }
  };

  deleteJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.checkTechnicianAccess(id, req.user);
      await this.service.deleteJob(id);
      res.json({ success: true, message: "Job deleted" });
    } catch (error) {
      next(error);
    }
  };
}
