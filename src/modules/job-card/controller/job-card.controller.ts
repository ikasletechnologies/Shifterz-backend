import type { Request, Response, NextFunction } from 'express';
import { JobCardService } from '../service/job-card.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { logger } from '../../../shared/logger/logger.js';
import { db } from '../../../lib/db.js';
import { logAudit } from '../../../shared/services/audit.service.js';
import { JobCardPrintService } from '../service/job-card-print.service.js';


export class JobCardController {
  constructor(private readonly service: JobCardService = new JobCardService()) {}

  getJobs = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      let filter: any = {};
      if (req.user) {
        const userRole = (req.user.role || "").toUpperCase().replace(/[\s_]+/g, "_");
        if (userRole === "TECHNICIAN") {
          const conditions: any[] = [];
          if (req.user.id) conditions.push({ technicianId: req.user.id });
          if (req.user.name?.trim()) conditions.push({ technician: { equals: req.user.name.trim(), mode: "insensitive" } });
          filter = conditions.length > 0 ? { OR: conditions } : { id: "__NO_MATCH__" };
        } else if (["QUALITY_INSPECTOR", "QUALITY_INSPECTION", "QC_INSPECTOR", "QC", "QUALITY_ASSURANCE"].includes(userRole)) {
          filter = { status: { in: ["Completed", "Work Completed", "QC Pending", "Waiting QC", "Inspecting", "QC Passed", "QC Failed", "Ready For Billing"] } };
        } else if (userRole.includes("BILLING") || userRole.includes("ACCOUNTANT")) {
          filter = { status: { in: ["Ready For Billing", "QC Passed", "Delivered", "Out"] } };
        }
      }
      const list = await this.service.getJobs(filter);
      logger.info(`[Jobs API] User Role: ${req.user?.role}, Filter: ${JSON.stringify(filter)}, Results: ${list.length}`);
      res.json(list);
    } catch (error) {
      next(error);
    }
  };

  getJobById = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const job = await this.service.getJobWithDetails(id);
      res.json(job);
    } catch (error) {
      next(error);
    }
  };

  createJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createJob(req.body, req.user);
      await logAudit({
        module: "JOB",
        recordId: result.id,
        action: "CREATE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  updateJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.checkTechnicianAccess(id, req.user);
      const oldValue = await db.job.findUnique({ where: { id } });
      const result = await this.service.updateJob(id, req.body, req.user);
      await logAudit({
        module: "JOB",
        recordId: id,
        action: "UPDATE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  submitChecklist = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await db.job.findUnique({ where: { id } });
      const result = await this.service.submitChecklist(id, req.body.checklist);
      await logAudit({
        module: "JOB",
        recordId: id,
        action: "SUBMIT_CHECKLIST",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
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
      const oldValue = await db.job.findUnique({ where: { id } });
      await this.service.deleteJob(id);
      await logAudit({
        module: "JOB",
        recordId: id,
        action: "DELETE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: null,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json({ success: true, message: "Job deleted" });
    } catch (error) {
      next(error);
    }
  };

  // ─── Job History ──────────────────────────────────────────────────────────

  getJobHistory = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const history = await this.service.getJobHistory(id);
      res.json(history);
    } catch (error) {
      next(error);
    }
  };

  // ─── Additional Work ──────────────────────────────────────────────────────

  listAdditionalWorks = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const jobId = String(req.params.id);
      const works = await this.service.listAdditionalWorks(jobId);
      res.json(works);
    } catch (error) {
      next(error);
    }
  };

  requestAdditionalWork = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const jobId = String(req.params.id);
      const result = await this.service.requestAdditionalWork(jobId, req.body, {
        id: req.user?.id,
        name: req.user?.name,
        franchiseId: req.user?.franchiseId ?? undefined,
      });
      await logAudit({
        module: "ADDITIONAL_WORK",
        recordId: jobId,
        action: "REQUEST",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  resolveAdditionalWork = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const awId = String(req.params.awId);
      const result = await this.service.resolveAdditionalWork(awId, req.body, req.user);
      await logAudit({
        module: "ADDITIONAL_WORK",
        recordId: result.jobId,
        action: req.body.status === 'Approved' ? "APPROVE" : "REJECT",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  // ─── Work Stage (10.5) ────────────────────────────────────────────────────

  updateWorkStage = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.checkTechnicianAccess(id, req.user);
      const oldValue = await db.job.findUnique({ where: { id } });
      const result = await this.service.updateWorkStage(id, req.body.stage, req.body.notes, req.user);
      await logAudit({
        module: "JOB_STAGE",
        recordId: id,
        action: "UPDATE_STAGE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  // ─── Work Photographs (10.6) ──────────────────────────────────────────────

  uploadJobPhotos = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const category = String(req.body.category || '');
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        res.status(400).json({ error: "No files uploaded" });
        return;
      }
      const urls = files.map((f) => `/uploads/${f.filename}`);
      const result = await this.service.uploadJobPhotos(id, category, urls, req.user);
      await logAudit({
        module: "JOB_PHOTO",
        recordId: id,
        action: "UPLOAD",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: { category, urls },
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  listJobPhotos = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.listJobPhotos(id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  // ─── Work Notes (10.9) ────────────────────────────────────────────────────

  addWorkNote = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.addWorkNote(id, req.body.note, req.user);
      await logAudit({
        module: "WORK_NOTE",
        recordId: id,
        action: "CREATE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  listWorkNotes = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.listWorkNotes(id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  // ─── Material Consumption (10.8) ──────────────────────────────────────────

  recordMaterialConsumption = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.recordMaterialConsumption(id, req.body, req.user);
      await logAudit({
        module: "MATERIAL_CONSUMPTION",
        recordId: id,
        action: "REQUEST",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  };

  listMaterialConsumptions = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.listMaterialConsumptions(id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  resolveMaterialConsumption = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const mcId = String(req.params.mcId);
      const result = await this.service.resolveMaterialConsumption(mcId, req.body, req.user);
      await logAudit({
        module: "MATERIAL_CONSUMPTION",
        recordId: result.jobId,
        action: req.body.status === 'Approved' ? "APPROVE" : "REJECT",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  // ─── Completion Request (10.10) ───────────────────────────────────────────

  requestCompletion = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await db.job.findUnique({ where: { id } });
      const result = await this.service.requestCompletion(id, req.user);
      await logAudit({
        module: "JOB_COMPLETION",
        recordId: id,
        action: "SUBMIT_FOR_QC",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  };

  printJobCard = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const copyType = req.query.copy === 'workshop' ? 'workshop' : 'customer';

      // Access control check: Only management roles can print Workshop Copy (which contains internal notes)
      if (copyType === 'workshop') {
        const userRole = (req.user?.role || '').toUpperCase().replace(/[\s_]+/g, '_');
        const managementRoles = ['SUPER_ADMIN', 'HQ_USER', 'FRANCHISE_ADMIN', 'BRANCH_MANAGER'];
        if (!managementRoles.includes(userRole)) {
          res.status(403).json({ error: 'Only authorized management may access the Workshop copy containing internal notes.' });
          return;
        }
      }

      const printService = new JobCardPrintService();
      await printService.generatePdf(id, copyType, res);
    } catch (error) {
      next(error);
    }
  };
}
