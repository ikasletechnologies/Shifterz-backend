import type { Response, NextFunction } from 'express';
import { QcService } from './qc.service.js';
import type { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../shared/services/audit.service.js';
import { dispatchQcAlerts } from '../../shared/services/notification.service.js';

export class QcController {
  constructor(private readonly service: QcService = new QcService()) {}

  private resolveScope(req: AuthRequest): string | null {
    const userRole = req.user?.role || 'UNKNOWN';
    if (userRole === 'SUPER_ADMIN' || userRole === 'HQ_USER') {
      return req.query.franchiseId ? String(req.query.franchiseId) : null;
    }
    return req.user?.franchiseId || null;
  }

  // ─── QC Queue ─────────────────────────────────────────────────────────────

  getQueue = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const franchiseId = this.resolveScope(req);
      const data = await this.service.getQueue(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  // ─── Checklist Template ─────────────────────────────────────────────────────

  getChecklistTemplate = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const franchiseId = this.resolveScope(req);
      const data = await this.service.getChecklistTemplate(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  createChecklistTemplateItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createChecklistTemplateItem(req.body, req.user);
      res.status(201).json(result);
    } catch (error) { next(error); }
  };

  updateChecklistTemplateItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.updateChecklistTemplateItem(id, req.body);
      res.json(result);
    } catch (error) { next(error); }
  };

  deleteChecklistTemplateItem = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      await this.service.deleteChecklistTemplateItem(id);
      res.json({ success: true, message: "Checklist item deleted" });
    } catch (error) { next(error); }
  };

  // ─── QC Assignment (12.3) ──────────────────────────────────────────────────

  assignInspector = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const jobId = String(req.params.jobId);
      const result = await this.service.assignInspector(jobId, req.body, req.user);
      await logAudit({
        module: "QC",
        recordId: jobId,
        action: "ASSIGN",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.status(201).json(result);
    } catch (error) { next(error); }
  };

  // ─── QC History (12.8) ─────────────────────────────────────────────────────

  listInspections = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const jobId = String(req.params.jobId);
      const data = await this.service.listInspections(jobId);
      res.json(data);
    } catch (error) { next(error); }
  };

  // ─── QC Checklist (12.4) ────────────────────────────────────────────────────

  submitChecklist = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const jobId = String(req.params.jobId);
      const result = await this.service.submitChecklist(jobId, req.body.checklist, req.user);
      await logAudit({
        module: "QC",
        recordId: jobId,
        action: "SUBMIT_CHECKLIST",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) { next(error); }
  };

  // ─── Photo Verification (12.5) ─────────────────────────────────────────────

  uploadPhotos = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const jobId = String(req.params.jobId);
      const category = String(req.body.category || '');
      const files = (req.files as Express.Multer.File[]) || [];
      if (files.length === 0) {
        res.status(400).json({ error: "No files uploaded" });
        return;
      }
      const urls = files.map((f) => `/uploads/${f.filename}`);
      const result = await this.service.uploadPhotos(jobId, category, urls, req.user);
      await logAudit({
        module: "QC",
        recordId: jobId,
        action: "UPLOAD_PHOTOS",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: { category, urls },
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.status(201).json(result);
    } catch (error) { next(error); }
  };

  // ─── QC Decision (12.6) ─────────────────────────────────────────────────────

  decide = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const jobId = String(req.params.jobId);
      const result = await this.service.decide(jobId, req.body, req.user);
      await logAudit({
        module: "QC",
        recordId: jobId,
        action: req.body.result === 'Passed' ? "PASS" : "FAIL",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: null,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) { next(error); }
  };

  // ─── HQ Alerts Sweep (12.10) ────────────────────────────────────────────────

  dispatchAlerts = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await dispatchQcAlerts();
      res.json({ success: true, ...result });
    } catch (error) { next(error); }
  };
}
