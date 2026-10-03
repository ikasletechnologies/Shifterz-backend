import { Router } from 'express';
import { JobCardController } from '../controller/job-card.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requirePermission } from '../../../middleware/auth.middleware.js';
import { upload } from '../../upload/config/multer.config.js';
import {
  createJobCardSchema,
  updateJobCardSchema,
  createAdditionalWorkSchema,
  approveAdditionalWorkSchema,
  workStageUpdateSchema,
  workNoteSchema,
  materialConsumptionSchema,
  materialConsumptionResolveSchema,
} from '../validation/job-card.validation.js';

export const jobCardRouter = Router();
const controller = new JobCardController();

jobCardRouter.use(authenticate);

// ─── Core Job Card CRUD ──────────────────────────────────────────────
jobCardRouter.get('/',                requirePermission('jobs', 'billing'), controller.getJobs);
jobCardRouter.get('/:id',             requirePermission('jobs', 'billing'), controller.getJobById);
jobCardRouter.post('/',               requirePermission('jobs'), validate(createJobCardSchema), controller.createJob);
jobCardRouter.put('/:id',             requirePermission('jobs'), validate(updateJobCardSchema), controller.updateJob);
jobCardRouter.delete('/:id',          requirePermission('jobs'), controller.deleteJob);
jobCardRouter.get('/:id/print',       requirePermission('jobs', 'billing'), controller.printJobCard);


// ─── QC ──────────────────────────────────────────────────────────────
// Phase 4B-2D-C — the legacy '/:id/qc-checklist' route (writing directly to
// Job.checklist, bypassing the entire canonical QCInspection pipeline) was
// removed here after confirming zero frontend callers, zero downstream
// readers of Job.checklist, and no test dependency. The canonical checklist
// path is PUT /api/qc/:jobId/checklist (qc.routes.ts). Job.checklist and
// Job.qcPhotos DB fields are left in place (out of scope); qc-photos below
// is a separate, still-legitimate upload path not covered by this removal.
jobCardRouter.post('/:id/qc-photos',    requirePermission('jobs', 'qc'), upload.array('files'), controller.uploadQcPhotos);

// ─── Job History ─────────────────────────────────────────────────────
jobCardRouter.get('/:id/history', requirePermission('jobs', 'billing'), controller.getJobHistory);

// ─── Additional Work ─────────────────────────────────────────────────
jobCardRouter.get('/:id/additional-works',               requirePermission('jobs', 'billing'), controller.listAdditionalWorks);
jobCardRouter.post('/:id/additional-works',              requirePermission('jobs'), validate(createAdditionalWorkSchema), controller.requestAdditionalWork);
jobCardRouter.put('/:id/additional-works/:awId/resolve', requirePermission('jobs'), validate(approveAdditionalWorkSchema), controller.resolveAdditionalWork);

// ─── Work Stage (10.5) ───────────────────────────────────────────────
jobCardRouter.patch('/:id/stage', requirePermission('jobs'), validate(workStageUpdateSchema), controller.updateWorkStage);

// ─── Work Photographs (10.6) ─────────────────────────────────────────
jobCardRouter.post('/:id/photos', requirePermission('jobs'), upload.array('files'), controller.uploadJobPhotos);
jobCardRouter.get('/:id/photos',  requirePermission('jobs', 'billing'), controller.listJobPhotos);

// ─── Work Notes (10.9) ───────────────────────────────────────────────
jobCardRouter.post('/:id/notes', requirePermission('jobs'), validate(workNoteSchema), controller.addWorkNote);
jobCardRouter.get('/:id/notes',  requirePermission('jobs', 'billing'), controller.listWorkNotes);

// ─── Material Consumption (10.8) ────────────────────────────────────
jobCardRouter.post('/:id/materials',           requirePermission('jobs'), validate(materialConsumptionSchema), controller.recordMaterialConsumption);
jobCardRouter.get('/:id/materials',            requirePermission('jobs', 'billing'), controller.listMaterialConsumptions);
jobCardRouter.put('/materials/:mcId/resolve',  requirePermission('jobs'), validate(materialConsumptionResolveSchema), controller.resolveMaterialConsumption);

// ─── Completion Request (10.10) ──────────────────────────────────────
jobCardRouter.post('/:id/completion-request', requirePermission('jobs'), controller.requestCompletion);
