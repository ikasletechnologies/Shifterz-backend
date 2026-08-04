import { Router } from 'express';
import { JobCardController } from '../controller/job-card.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { upload } from '../../upload/config/multer.config.js';
import {
  createJobCardSchema,
  updateJobCardSchema,
  qcChecklistSchema,
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

// ─── Core Job Card CRUD ────────────────────────────────────────────────────────
jobCardRouter.get('/',                controller.getJobs);
jobCardRouter.get('/:id',             controller.getJobById);
jobCardRouter.post('/',               validate(createJobCardSchema), controller.createJob);
jobCardRouter.put('/:id',             validate(updateJobCardSchema), controller.updateJob);
jobCardRouter.delete('/:id',          controller.deleteJob);
jobCardRouter.get('/:id/print',       controller.printJobCard);


// ─── QC ───────────────────────────────────────────────────────────────────────
jobCardRouter.post('/:id/qc-checklist', validate(qcChecklistSchema), controller.submitChecklist);
jobCardRouter.post('/:id/qc-photos',    upload.array('files'), controller.uploadQcPhotos);

// ─── Job History ──────────────────────────────────────────────────────────────
jobCardRouter.get('/:id/history', controller.getJobHistory);

// ─── Additional Work ──────────────────────────────────────────────────────────
jobCardRouter.get('/:id/additional-works',               controller.listAdditionalWorks);
jobCardRouter.post('/:id/additional-works',              validate(createAdditionalWorkSchema), controller.requestAdditionalWork);
jobCardRouter.put('/:id/additional-works/:awId/resolve', validate(approveAdditionalWorkSchema), controller.resolveAdditionalWork);

// ─── Work Stage (10.5) ──────────────────────────────────────────────────────────
jobCardRouter.patch('/:id/stage', validate(workStageUpdateSchema), controller.updateWorkStage);

// ─── Work Photographs (10.6) ─────────────────────────────────────────────────────
jobCardRouter.post('/:id/photos', upload.array('files'), controller.uploadJobPhotos);
jobCardRouter.get('/:id/photos',  controller.listJobPhotos);

// ─── Work Notes (10.9) ───────────────────────────────────────────────────────────
jobCardRouter.post('/:id/notes', validate(workNoteSchema), controller.addWorkNote);
jobCardRouter.get('/:id/notes',  controller.listWorkNotes);

// ─── Material Consumption (10.8) ─────────────────────────────────────────────────
jobCardRouter.post('/:id/materials',           validate(materialConsumptionSchema), controller.recordMaterialConsumption);
jobCardRouter.get('/:id/materials',            controller.listMaterialConsumptions);
jobCardRouter.put('/materials/:mcId/resolve',  validate(materialConsumptionResolveSchema), controller.resolveMaterialConsumption);

// ─── Completion Request (10.10) ──────────────────────────────────────────────────
jobCardRouter.post('/:id/completion-request', controller.requestCompletion);
