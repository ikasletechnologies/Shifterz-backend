import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { env } from "../config/env.js";

const JWT_SECRET = env.JWT_SECRET;

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    name?: string;
    username?: string;
    franchiseId?: string | null;
    hqControlled?: boolean;
    permissions?: string[];
  };
  // Set by the `tenant` middleware once the request's source (Franchise vs HQ) is resolved.
  tenantFilter?: { franchiseId?: string | null };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
    }

    const token = authHeader.split(" ")[1] as string;
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    req.user = {
      id: decoded.id,
      role: decoded.role,
      name: decoded.name || decoded.username,
      username: decoded.username,
      franchiseId: decoded.franchiseId || null,
      hqControlled: decoded.hqControlled === true,
      permissions: decoded.permissions || [],
    };
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

export const requirePermission = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (req.user.role === "SUPER_ADMIN") {
      return next();
    }
    
    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: `Forbidden: Missing permission ${permission}` });
    }
    
    next();
  };
};

// Resolves whether this request originates from HQ (global admin, or an
// employee intentionally stationed at HQ) or from a specific Franchise, and
// attaches the resulting scope as `req.tenantFilter` for downstream routes.
export const tenant = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const isHQAdmin = req.user.role === "SUPER_ADMIN" || req.user.role === "HQ_USER";
  const isHQControlled = req.user.hqControlled === true;

  if (isHQAdmin) {
    // Full cross-franchise visibility — no scope restriction.
    req.tenantFilter = {};
    return next();
  }

  if (!req.user.franchiseId && !isHQControlled) {
    return res.status(403).json({ error: "Forbidden: No franchise assigned" });
  }

  // Either scoped to their own franchise, or to HQ's own records (franchiseId: null).
  req.tenantFilter = { franchiseId: req.user.franchiseId ?? null };
  next();
};
