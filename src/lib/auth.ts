import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { logger } from "../shared/logger/logger.js";
import { db } from "./db.js";
import { env } from "../config/env.js";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    permissions: string[];
    franchiseId?: string | null;
  };
}

// Helper to resolve user permissions based on user-specific overrides or role defaults
export async function resolveUserPermissions(userId: string, role: string): Promise<string[]> {
  try {
    const user = await db.employee.findUnique({
      where: { id: userId },
      include: { permission: true },
    });
    
    if (user?.permission?.modules && user.permission.modules.length > 0) {
      return user.permission.modules;
    }
    
    const baseRole = role.split("|")[0] || "";
    const rp = await db.rolePermission.findUnique({
      where: { role: baseRole },
    });
    
    if (rp?.permissions) {
      return rp.permissions;
    }
  } catch (err) {
    logger.error(`Error resolving user permissions: ${err}`);
  }
  
  const fallbackMatrix: Record<string, string[]> = {
    SUPER_ADMIN: ["dashboard", "carin", "jobs", "outpass", "leads", "customers", "billing", "payments", "inventory", "reports", "employees", "attendance", "settings", "roles"],
    HQ_USER: ["dashboard", "carin", "jobs", "outpass", "leads", "customers", "billing", "payments", "inventory", "reports", "employees", "attendance", "settings"],
    FRANCHISE_ADMIN: ["dashboard", "carin", "jobs", "outpass", "leads", "customers", "billing", "payments", "inventory", "reports", "employees", "attendance"],
    BRANCH_MANAGER: ["dashboard", "carin", "jobs", "outpass", "leads", "customers", "billing", "payments", "inventory", "reports", "attendance"],
    RECEPTION_EXECUTIVE: ["dashboard", "carin", "outpass", "customers", "leads", "attendance"],
    SERVICE_ADVISOR: ["dashboard", "carin", "jobs", "customers", "leads"],
    TECHNICIAN: ["dashboard", "jobs", "attendance"],
    QUALITY_INSPECTOR: ["dashboard", "jobs", "carin"],
    BILLING_EXECUTIVE: ["dashboard", "billing", "payments", "reports"],
    INVENTORY_EXECUTIVE: ["dashboard", "inventory", "reports"],
  };
  
  const base = role.split("|")[0] || "";
  return fallbackMatrix[base] || [];
}


