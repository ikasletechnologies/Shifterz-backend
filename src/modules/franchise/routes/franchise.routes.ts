import { Router } from 'express';
import { FranchiseController } from '../controller/franchise.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireRole } from '../../../middleware/auth.middleware.js';
import { createFranchiseSchema, updateFranchiseSchema } from '../validation/franchise.validation.js';

export const franchiseRouter = Router();
const controller = new FranchiseController();

// Phase 0.2 — confirmed vulnerability fix. This router duplicates
// /api/hq/franchises (which the frontend actually uses) and previously had
// no role check at all, so any authenticated employee — any role, any
// franchise — could create/update/delete franchises through it. Locked to
// the same authoritative policy as the HQ route rather than removed
// outright, in case an unknown consumer still depends on this path.
franchiseRouter.use(authenticate);
franchiseRouter.use(requireRole("SUPER_ADMIN", "HQ_USER"));

franchiseRouter.get('/', controller.getAllFranchises);
franchiseRouter.post('/', validate(createFranchiseSchema), controller.createFranchise);
franchiseRouter.put('/:id', validate(updateFranchiseSchema), controller.updateFranchise);
franchiseRouter.delete('/:id', controller.deleteFranchise);
