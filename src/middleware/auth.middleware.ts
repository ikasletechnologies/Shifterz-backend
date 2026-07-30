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
    permissions?: string[];
  };
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

export const tenant = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "HQ_USER") {
    if (!req.user.franchiseId) {
      return res.status(403).json({ error: "Forbidden: No franchise assigned" });
    }
  }
  
  next();
};
