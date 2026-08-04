import { Router } from 'express';
import { WorkflowStageController } from '../controller/workflow-stage.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate } from '../../../middleware/auth.middleware.js';
import { createWorkflowStageSchema, updateWorkflowStageSchema } from '../validation/workflow-stage.validation.js';

export const workflowStageRouter = Router();
const controller = new WorkflowStageController();

workflowStageRouter.use(authenticate);

workflowStageRouter.get('/', controller.getAllStages);
workflowStageRouter.post('/', validate(createWorkflowStageSchema), controller.createStage);
workflowStageRouter.put('/:id', validate(updateWorkflowStageSchema), controller.updateStage);
workflowStageRouter.delete('/:id', controller.deleteStage);
