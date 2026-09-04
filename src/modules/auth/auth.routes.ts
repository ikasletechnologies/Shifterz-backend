import { Router } from "express";
import { authController } from "./auth.controller.js";
import { authenticate, requireRole } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { loginRateLimiter } from "../../middleware/rateLimit.middleware.js";
import { loginSchema, updateProfileSchema, updateRolePermissionsSchema } from "./auth.validation.js";

const router = Router();

// Public route
router.post("/login", loginRateLimiter, validate(loginSchema), authController.login);

// Protected routes
router.get("/me", authenticate, authController.getMe);
router.post("/logout", authenticate, authController.logout);
router.put("/profile", authenticate, validate(updateProfileSchema), authController.updateProfile);

// Admin routes (Example RBAC usage)// RBAC
router.get("/roles/permissions", authenticate, requireRole("SUPER_ADMIN", "HQ_USER"), authController.getRolePermissions);
router.put("/roles/permissions/:role", authenticate, requireRole("SUPER_ADMIN", "HQ_USER"), validate(updateRolePermissionsSchema), authController.updateRolePermissions);

export const authRoutes = router;
