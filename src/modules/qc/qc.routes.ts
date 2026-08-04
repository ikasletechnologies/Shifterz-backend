import { Router } from 'express';
import { QcController } from './qc.controller.js';
import { validate } from '../../middleware/validate.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
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
qcRouter.get('/checklist-template',        controller.getChecklistTemplate);
qcRouter.post('/checklist-template',       validate(createChecklistTemplateItemSchema), controller.createChecklistTemplateItem);
qcRouter.put('/checklist-template/:id',    validate(updateChecklistTemplateItemSchema), controller.updateChecklistTemplateItem);
qcRouter.delete('/checklist-template/:id', controller.deleteChecklistTemplateItem);

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
