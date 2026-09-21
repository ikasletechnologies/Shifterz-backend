import { Router } from 'express';
import { WorkflowStageController } from '../controller/workflow-stage.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireAction } from '../../../middleware/auth.middleware.js';
import { createWorkflowStageSchema, updateWorkflowStageSchema } from '../validation/workflow-stage.validation.js';

export const workflowStageRouter = Router();
const controller = new WorkflowStageController();

workflowStageRouter.use(authenticate);

// Read/use stays ungated — D-17 concerns administering the configuration,
// not executing the workflow it defines.
workflowStageRouter.get('/', controller.getAllStages);
// RBAC-04 — D-17. requireAction() is additive: WorkflowStageService's
// tenant-isolation check (assertWithinScope, fixed during the D-17 lock) on
// update/delete is unchanged and still runs after this gate.
workflowStageRouter.post('/', requireAction('workflow:stages:manage'), validate(createWorkflowStageSchema), controller.createStage);
workflowStageRouter.put('/:id', requireAction('workflow:stages:manage'), validate(updateWorkflowStageSchema), controller.updateStage);
workflowStageRouter.delete('/:id', requireAction('workflow:stages:manage'), controller.deleteStage);
