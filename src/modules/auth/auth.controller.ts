import type { Request, Response, NextFunction } from "express";
import { authService } from "./auth.service.js";
import type { AuthRequest } from "../../middleware/auth.middleware.js";

import { logAudit } from "../../shared/services/audit.service.js";

const COOKIE_NAME = "token";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Phase 0.10 — the cookie is the only place the JWT lives on the client from
// now on: httpOnly (invisible to JS/XSS), and Secure+SameSite=None in
// production because the frontend and backend are deployed on unrelated
// origins there (SameSite=Lax is used in local dev, where both run on
// http://localhost and Secure cookies would otherwise be silently dropped).
function cookieOptions(maxAge: number) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    maxAge,
    path: "/",
  };
}

function requestMeta(req: Request) {
  return {
    ipAddress: req.ip || String(req.headers["x-forwarded-for"] || ""),
    device: req.headers["user-agent"] ? String(req.headers["user-agent"]) : "Unknown Device",
  };
}

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction) {
    const { username } = req.body;
    try {
      const { password } = req.body;
      const result = await authService.login(username, password, requestMeta(req));

      // Log successful login
      await logAudit({
        module: "Login",
        recordId: result.user.id,
        action: "SUCCESS",
        userId: result.user.username || result.user.id,
        branchId: result.user.franchiseId || null,
        ...requestMeta(req),
        newValue: { username: result.user.username, role: result.user.role }
      });

      res.cookie(COOKIE_NAME, result.token, cookieOptions(SESSION_TTL_MS));
      res.json(result);
    } catch (error: any) {
      // Log failed login
      await logAudit({
        module: "Login",
        recordId: "NONE",
        action: "FAILURE",
        userId: username || "Unknown",
        ...requestMeta(req),
        oldValue: { error: error.message }
      });

      if (error.message === "Invalid username or password") {
        res.status(401).json({ error: error.message });
      } else {
        res.status(403).json({ error: error.message });
      }
    }
  }

  // Phase 0.5 — real server-side logout: revokes the session backing the
  // current token so a captured/replayed copy of it stops working
  // immediately, then clears the cookie client-side.
  async logout(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.sessionId) return res.status(401).json({ error: "Unauthorized" });

      await authService.logout(req.sessionId);

      await logAudit({
        module: "Login",
        recordId: req.user.id,
        action: "LOGOUT",
        userId: req.user.username || req.user.id,
        branchId: req.user.franchiseId || null,
        ...requestMeta(req),
      });

      res.clearCookie(COOKIE_NAME, { ...cookieOptions(0), maxAge: undefined });
      res.json({ success: true });
    } catch (error: any) {
      next(error);
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
      const result = await authService.updateProfile(req.user.id, req.body, requestMeta(req));

      if (result.sessionsInvalidated) {
        // Phase 0.7 — old cookie is dead everywhere; the caller gets a fresh
        // one for the session they're continuing on right now.
        await logAudit({
          module: "Login",
          recordId: req.user.id,
          action: "PASSWORD_CHANGE",
          userId: req.user.username || req.user.id,
          branchId: req.user.franchiseId || null,
          ...requestMeta(req),
        });
        res.cookie(COOKIE_NAME, result.token, cookieOptions(SESSION_TTL_MS));
      }

      res.json(result.user);
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
