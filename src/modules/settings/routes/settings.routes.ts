import { Router } from 'express';
import { SettingsController } from '../controller/settings.controller.js';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireAction } from '../../../middleware/auth.middleware.js';
import { updateSettingSchema } from '../validation/settings.validation.js';

export const settingsRouter = Router();
const controller = new SettingsController();

settingsRouter.use(authenticate);

settingsRouter.get('/', controller.getSettings);
// RBAC-04 — D-12. Global only, per the locked decision (no franchise-level
// settings exist) — requireAction() here does not introduce a new franchise
// carve-out; FRANCHISE_ADMIN still has no grant for this action.
settingsRouter.put('/', requireAction('settings:edit'), validate(updateSettingSchema), controller.updateSettings);

// Read-only GSTIN lookup (setup wizard auto-fill) — any authenticated user,
// same as GET / above. Server-side cached (GstinCache), so repeat lookups
// never spend another upstream credit regardless of who requests them.
settingsRouter.get('/gstin/:gstin', controller.lookupGstin);
