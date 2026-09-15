import type { Response, NextFunction } from 'express';
import { QcTemplateVersionService } from './qc-template-version.service.js';
import type { AuthRequest } from '../../middleware/auth.middleware.js';
import { logAudit } from '../../shared/services/audit.service.js';

// Phase 4B-2D-D — Draft/Publish HTTP surface for the whole-template version
// model (Phase 4B-2D-C). Every mutating action is audit-logged the same way
// every other QC controller action already is (module "QC_TEMPLATE",
// matching qc.controller.ts's own template-CRUD audit entries added this
// same phase) — branchId is always the ACTING user's own franchiseId, never
// the target record's, so a rejected cross-scope attempt (the underlying
// service throws before the logAudit line is reached) never generates an
// audit entry, exactly like the existing template CRUD audit wiring.
export class QcTemplateVersionController {
  constructor(private readonly service: QcTemplateVersionService = new QcTemplateVersionService()) {}

  createDraft = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.createDraftVersion(req.body.items, req.user);
      await logAudit({
        module: "QC_TEMPLATE",
        recordId: result.id,
        action: "CREATE_DRAFT",
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

  updateDraft = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await this.service.getVersionById(id, req.user).catch(() => null);
      const result = await this.service.updateDraftVersionItems(id, req.body.items, req.user);
      await logAudit({
        module: "QC_TEMPLATE",
        recordId: id,
        action: "UPDATE_DRAFT",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: result,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) { next(error); }
  };

  discardDraft = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await this.service.getVersionById(id, req.user).catch(() => null);
      await this.service.discardDraftVersion(id, req.user);
      await logAudit({
        module: "QC_TEMPLATE",
        recordId: id,
        action: "DISCARD_DRAFT",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: null,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json({ success: true, message: "Draft version discarded" });
    } catch (error) { next(error); }
  };

  // Phase 4B-2D-D — records the previous and newly-published version
  // (approved business rule / D-22's own "Conditions": "Publish actions
  // must be audit-tracked ... recording the previous and newly-published
  // version"). The "previous published" read happens BEFORE publishing —
  // it is informational only for the audit trail, never used to make the
  // publish decision itself (that's QcTemplateVersionRepository
  // .publishVersion's own locked, transactional read).
  publish = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const target = await this.service.getVersionById(id, req.user).catch(() => null);
      const previousPublished = target ? await this.service.getPublishedVersion(target.franchiseId) : null;
      const result = await this.service.publishVersion(id, req.user);
      await logAudit({
        module: "QC_TEMPLATE",
        recordId: id,
        action: "PUBLISH",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue: previousPublished ? { id: previousPublished.id, versionNumber: previousPublished.versionNumber, status: "Superseded" } : null,
        newValue: { id: result.id, versionNumber: result.versionNumber, status: result.status },
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(result);
    } catch (error) { next(error); }
  };

  // Phase 4B-2E — read-only, ungated (same convention as the legacy
  // GET /checklist-template, which was always readable by any authenticated
  // QC-adjacent user regardless of scope). Added specifically because the
  // template-management UI's own spec requires a franchise user to see the
  // current HQ standard, read-only, alongside their own franchise Draft —
  // and getById/list are both scope-restricted to the caller's own scope,
  // so neither can serve this. Deliberately narrow: only the HQ scope's
  // *current Published* version — never HQ Drafts or HQ history, and never
  // any other franchise's data.
  getHqPublished = async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.getPublishedVersion(null);
      res.json(result);
    } catch (error) { next(error); }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const result = await this.service.getVersionById(id, req.user);
      res.json(result);
    } catch (error) { next(error); }
  };

  list = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const result = await this.service.listVersions(req.user);
      res.json(result);
    } catch (error) { next(error); }
  };
}
