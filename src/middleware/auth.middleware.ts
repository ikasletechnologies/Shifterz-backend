import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env.js";
import { db } from "../lib/db.js";
import { resolveActionPermissions, ALL_ACTIONS, resolveUserPermissions, canonicalizePermission } from "../lib/auth.js";
import { resolveDataScope, scopeWhere } from "../shared/scope/dataScope.js";

const JWT_SECRET = env.JWT_SECRET;

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    name?: string;
    username?: string;
    franchiseId?: string | null;
    franchiseStatus?: string;
    hqControlled?: boolean;
    permissions?: string[];
  };
  // Set by the `tenant` middleware once the request's source (Franchise vs HQ) is resolved.
  tenantFilter?: { franchiseId?: string | null };
  // The Session.id backing the current token, set by `authenticate`. Used by
  // the logout endpoint to revoke exactly this session.
  sessionId?: string;
}

// Extracts the bearer token from either an httpOnly cookie (the transport the
// web frontend now uses) or a legacy `Authorization: Bearer <token>` header
// (kept for non-browser/API clients). Cookie takes precedence when both are
// present.
function extractToken(req: Request): string | null {
  const cookieToken = (req as any).cookies?.token;
  if (cookieToken) return cookieToken;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1] as string;
  }
  return null;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Phase 0.4/0.6 — a signature-valid JWT is no longer sufficient on its
    // own. The session it was issued for must still exist and be
    // unrevoked, and the employee it belongs to must still be in an active,
    // usable account state. This is what makes logout, deactivation, and
    // password changes actually take effect immediately instead of waiting
    // for the token's natural 24h expiry.
    if (!decoded.jti) {
      // Tokens issued before this change carry no jti/session — reject them
      // so every active user is forced through a fresh, session-backed login.
      return res.status(401).json({ error: "Unauthorized: Session expired, please log in again" });
    }

    const session = await db.session.findUnique({
      where: { jti: decoded.jti },
      include: {
        employee: {
          include: {
            franchise: {
              select: { id: true, status: true, isDeleted: true }
            }
          }
        }
      },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      return res.status(401).json({ error: "Unauthorized: Session expired or revoked" });
    }

    const employee = session.employee;
    if (
      !employee ||
      employee.isDeleted ||
      employee.status !== "Active" ||
      employee.approvalStatus === "Rejected" ||
      employee.approvalStatus === "Pending"
    ) {
      return res.status(401).json({ error: "Unauthorized: Account is no longer active" });
    }

    const isHqRole = employee.role === "SUPER_ADMIN" || employee.role === "HQ_USER";
    let franchiseStatus = "ACTIVE";
    if (employee.franchiseId && employee.franchise) {
      if (employee.franchise.isDeleted) {
        return res.status(401).json({ error: "Unauthorized: Franchise has been deleted" });
      }
      const rawStatus = (employee.franchise.status || "").trim().toUpperCase();
      franchiseStatus = (rawStatus === "DEACTIVE" || rawStatus === "INACTIVE" || rawStatus === "DEACTIVATED")
        ? "DEACTIVE"
        : (rawStatus === "ACTIVE" ? "ACTIVE" : "PENDING");

      // Server-side enforcement for non-HQ users belonging to non-ACTIVE franchises
      if (!isHqRole && !employee.hqControlled) {
        if (franchiseStatus === "DEACTIVE" && req.method !== "GET" && !req.path.endsWith("/logout")) {
          return res.status(403).json({
            error: "Franchise is currently deactivated. Operational actions are disabled. Contact Headquarters."
          });
        }
        if (franchiseStatus === "PENDING" && req.method !== "GET" && !req.path.endsWith("/logout")) {
          return res.status(403).json({
            error: "Franchise is pending activation. Operational actions are restricted until activated by Super Admin."
          });
        }
      }
    }

    req.user = {
      id: decoded.id,
      role: decoded.role,
      name: decoded.name || decoded.username,
      username: decoded.username,
      franchiseId: decoded.franchiseId || null,
      franchiseStatus,
      hqControlled: decoded.hqControlled === true || employee.hqControlled === true,
      permissions: decoded.permissions || [],
    };
    req.sessionId = session.id;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Unauthorized: Token expired or invalid" });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden: Insufficient role" });
    }
    
    next();
  };
};

export const requirePermission = (...permissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.user.role === "SUPER_ADMIN") {
      return next();
    }
    
    // Live resolve permissions from DB so Super Admin changes take immediate effect
    try {
      const livePerms = await resolveUserPermissions(req.user.id, req.user.role);
      req.user.permissions = livePerms;
    } catch {
      // Fall back to token permissions if query fails
    }

    const userPerms = (req.user.permissions || []).map(canonicalizePermission);
    const hasPermission = permissions.some((p) => {
      const canon = canonicalizePermission(p);
      return (
        userPerms.includes(canon) ||
        (canon === "jobs" && userPerms.includes("workshop")) ||
        (canon === "workshop" && userPerms.includes("jobs")) ||
        (req.user?.permissions || []).includes(p)
      );
    });
    if (!hasPermission) {
      return res.status(403).json({ error: `Forbidden: Missing required permission (${permissions.join(' or ')})` });
    }
    
    next();
  };
};

// RBAC-03 — the action-level counterpart to requireRole/requirePermission.
// Not yet attached to any route (that's RBAC-04, gated on RBAC-02's grants
// being seeded). Deliberately mirrors requireRole's shape: same 401/403
// response contract, so swapping requireRole(...) for requireAction(...) on
// a route later is a drop-in change, not a rewrite.
//
// Unlike requirePermission (which reads req.user.permissions, baked into the
// JWT at login), this calls the DB-backed resolveActionPermissions() on
// every request — actions can change without the affected user re-logging
// in, at the cost of two extra queries per protected request. That's an
// existing property of resolveActionPermissions itself (Pre-flight Patch C),
// not a new tradeoff introduced here.
//
// Fails closed by construction: resolveActionPermissions() already returns
// [] on any resolution error (see lib/auth.ts), and an empty/non-matching
// list simply falls through to the 403 below — there is no code path here
// that defaults to allow.
//
// `resolver` is injectable (defaults to the real DB-backed
// resolveActionPermissions) so this middleware's branching logic — 401 with
// no user, 403 on a missing action, next() on a match or the ALL_ACTIONS
// sentinel — can be unit-tested with a fake resolver and zero DB dependency,
// the same separation resolveActionPermissionsPure already established.
export const requireAction = (
  actionName: string,
  resolver: (userId: string, role: string) => Promise<string[]> = resolveActionPermissions
) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const actions = await resolver(req.user.id, req.user.role);
    if (actions.includes(ALL_ACTIONS) || actions.includes(actionName)) {
      return next();
    }

    return res.status(403).json({ error: `Forbidden: Missing action ${actionName}` });
  };
};

// Resolves whether this request originates from HQ (global admin, or an
// employee intentionally stationed at HQ) or from a specific Franchise, and
// attaches the resulting scope as `req.tenantFilter` for downstream routes.
export const tenant = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const scope = resolveDataScope(req.user);
  if (scope.unrestricted) {
    // Full cross-franchise visibility — no scope restriction.
    req.tenantFilter = {};
    return next();
  }

  // Non-HQ actors: strictly scope by their franchiseId, or __NO_FRANCHISE__ sentinel
  req.tenantFilter = scopeWhere(scope);
  next();
};
