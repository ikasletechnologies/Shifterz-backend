import type { Request, Response, NextFunction } from "express";
import { authService } from "./auth.service.js";
import type { AuthRequest } from "../../middleware/auth.middleware.js";

import { logAudit } from "../../shared/services/audit.service.js";

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    const { username } = req.body;
    try {
      const { password } = req.body;
      const result = await authService.login(username, password);
      
      // Log successful login
      await logAudit({
        module: "Login",
        recordId: result.user.id,
        action: "SUCCESS",
        userId: result.user.username || result.user.id,
        branchId: result.user.franchiseId || null,
        ipAddress: req.ip || String(req.headers["x-forwarded-for"] || ""),
        device: req.headers["user-agent"] || "Unknown Device",
        newValue: { username: result.user.username, role: result.user.role }
      });

      res.json(result);
    } catch (error: any) {
      // Log failed login
      await logAudit({
        module: "Login",
        recordId: "NONE",
        action: "FAILURE",
        userId: username || "Unknown",
        ipAddress: req.ip || String(req.headers["x-forwarded-for"] || ""),
        device: req.headers["user-agent"] || "Unknown Device",
        oldValue: { error: error.message }
      });

      if (error.message === "Invalid username or password") {
        res.status(401).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async getMe(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const user = await authService.getMe(req.user.id);
      res.json({ user });
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  }

  async updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const updatedUser = await authService.updateProfile(req.user.id, req.body);
      res.json(updatedUser);
    } catch (error: any) {
      if (error.message === "Current password incorrect" || error.message === "User not found") {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  async getRolePermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const permissions = await authService.getRolePermissions();
      res.json(permissions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateRolePermissions(req: Request, res: Response, next: NextFunction) {
    try {
      const role = String(req.params.role);
      const { permissions } = req.body;
      const updated = await authService.updateRolePermissions(role, permissions);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}

export const authController = new AuthController();
