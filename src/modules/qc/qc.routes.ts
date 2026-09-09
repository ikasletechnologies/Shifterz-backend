import { Router } from 'express';
import { QcController } from './qc.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { authenticate, requireAction } from '../../middleware/auth.middleware.js';
import { upload } from '../upload/config/multer.config.js';
import {
  assignQcSchema,
  qcChecklistSchema,
  qcDecisionSchema,
  createChecklistTemplateItemSchema,
  updateChecklistTemplateItemSchema,
} from './qc.validation.js';

export const qcRouter = Router();
const controller = new QcController();

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

// ─── QC Assignment (12.3) ─────────────────────────────────────────────────────────
qcRouter.post('/:jobId/assign', validate(assignQcSchema), controller.assignInspector);

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
