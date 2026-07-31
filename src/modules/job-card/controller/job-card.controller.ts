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
            status: { in: ["Completed", "QC Pending", "QC Passed", "Ready For Billing"] }
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
      const result = await this.service.updateJob(id, req.body);
      res.json(result);
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
