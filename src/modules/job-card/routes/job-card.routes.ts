import { Router } from 'express';
import { JobCardController } from '../controller/job-card.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { upload } from '../../upload/config/multer.config.js';
import { createJobCardSchema, updateJobCardSchema, qcChecklistSchema } from '../validation/job-card.validation.js';

export const jobCardRouter = Router();
const controller = new JobCardController();

jobCardRouter.use(authenticate);

jobCardRouter.get('/', controller.getJobs);
jobCardRouter.post('/', validate(createJobCardSchema), controller.createJob);
jobCardRouter.put('/:id', validate(updateJobCardSchema), controller.updateJob);
jobCardRouter.post('/:id/qc-checklist', validate(qcChecklistSchema), controller.submitChecklist);
jobCardRouter.post('/:id/qc-photos', upload.array('files'), controller.uploadQcPhotos);
jobCardRouter.delete('/:id', controller.deleteJob);
