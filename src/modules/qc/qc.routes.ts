import { Router } from 'express';
import { QcController } from './qc.controller.js';
import { QcTemplateVersionController } from './qc-template-version.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { authenticate, requireAction } from '../../middleware/auth.middleware.js';
import { upload } from '../upload/config/multer.config.js';
import {
  assignQcSchema,
  qcChecklistSchema,
  qcDecisionSchema,
  createChecklistTemplateItemSchema,
  updateChecklistTemplateItemSchema,
  createTemplateVersionSchema,
  updateTemplateVersionSchema,
} from './qc.validation.js';

export const qcRouter = Router();
const controller = new QcController();
const versionController = new QcTemplateVersionController();

qcRouter.use(authenticate);

// ─── QC Queue ───────────────────────────────────────────────────────────────────
qcRouter.get('/queue', controller.getQueue);

// ─── Checklist Template (12.4, HQ-configurable) ──────────────────────────────────
// Read/use stays ungated — D-18 explicitly allows QUALITY_INSPECTOR (and
// anyone with QC execution access) to use templates without administering
// them; qc:templates:view/:use were deliberately deferred/TBD (RBAC-01), so
// no action is invented here for the read path.
qcRouter.get('/checklist-template',        controller.getChecklistTemplate);
// RBAC-04 — D-18. requireAction() is additive: QcService's tenant-isolation
// check (assertWithinScope, fixed during the D-18 lock) on update/delete,
// and the isDefault deletion guard, are unchanged and still run after this gate.
qcRouter.post('/checklist-template',       requireAction('qc:templates:manage'), validate(createChecklistTemplateItemSchema), controller.createChecklistTemplateItem);
qcRouter.put('/checklist-template/:id',    requireAction('qc:templates:manage'), validate(updateChecklistTemplateItemSchema), controller.updateChecklistTemplateItem);
qcRouter.delete('/checklist-template/:id', requireAction('qc:templates:manage'), controller.deleteChecklistTemplateItem);

// ─── Checklist Template VERSIONS (Phase 4B-2D-D — Draft/Publish foundation) ────────
// Read stays ungated, same rationale as GET /checklist-template above.
// Create/edit/discard a Draft: qc:templates:manage (D-18). Publish: the new,
// higher-stakes qc:templates:publish (D-22) — NOT satisfied by :manage alone.
qcRouter.get('/template-versions',              versionController.list);
// Must be registered BEFORE '/template-versions/:id' — Express would
// otherwise match "hq-published" as the :id param and swallow this route.
qcRouter.get('/template-versions/hq-published', versionController.getHqPublished);
qcRouter.get('/template-versions/:id',          versionController.getById);
qcRouter.post('/template-versions',             requireAction('qc:templates:manage'), validate(createTemplateVersionSchema), versionController.createDraft);
qcRouter.put('/template-versions/:id',          requireAction('qc:templates:manage'), validate(updateTemplateVersionSchema), versionController.updateDraft);
qcRouter.delete('/template-versions/:id',       requireAction('qc:templates:manage'), versionController.discardDraft);
qcRouter.post('/template-versions/:id/publish', requireAction('qc:templates:publish'), versionController.publish);

// ─── QC Assignment (12.3) ─────────────────────────────────────────────────────────
qcRouter.post('/:jobId/assign', validate(assignQcSchema), controller.assignInspector);

// ─── QC Inspection Start (Phase 4B-1) ──────────────────────────────────────────────
qcRouter.post('/:jobId/start', controller.startInspection);

// ─── QC History (12.8) ────────────────────────────────────────────────────────────
qcRouter.get('/:jobId/inspections', controller.listInspections);

// ─── QC Checklist (12.4) ──────────────────────────────────────────────────────────
qcRouter.put('/:jobId/checklist', validate(qcChecklistSchema), controller.submitChecklist);

// ─── Photo Verification (12.5) ────────────────────────────────────────────────────
qcRouter.post('/:jobId/photos', upload.array('files'), controller.uploadPhotos);

// ─── QC Decision (12.6) ────────────────────────────────────────────────────────────
qcRouter.post('/:jobId/decision', validate(qcDecisionSchema), controller.decide);

// ─── HQ Alerts Sweep (12.10) ───────────────────────────────────────────────────────
qcRouter.post('/dispatch-alerts', controller.dispatchAlerts);
