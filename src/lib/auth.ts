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

export const ALL_MODULES = [
  "dashboard", "carin", "jobs", "outpass", "leads", "customers",
  "billing", "payments", "inventory", "reports", "employees",
  "attendance", "settings", "roles"
];

export const FALLBACK_ROLE_MATRIX: Record<string, string[]> = {
  SUPER_ADMIN: [
    "dashboard", "carin", "jobs", "outpass", "leads", "customers",
    "billing", "payments", "inventory", "reports", "employees",
    "attendance", "settings", "roles"
  ],
  HQ_USER: [
    "dashboard", "carin", "jobs", "outpass", "leads", "customers",
    "billing", "payments", "inventory", "reports", "employees",
    "attendance", "settings"
  ],
  FRANCHISE_ADMIN: [
    "dashboard", "carin", "jobs", "outpass", "leads", "customers",
    "billing", "payments", "inventory", "reports", "employees",
    "attendance"
  ],
  BRANCH_MANAGER: [
    "dashboard", "carin", "jobs", "outpass", "leads", "customers",
    "billing", "payments", "inventory", "reports", "attendance"
  ],
  RECEPTION_EXECUTIVE: [
    "dashboard", "carin", "outpass", "customers", "leads", "attendance"
  ],
  SERVICE_ADVISOR: [
    "dashboard", "carin", "jobs", "outpass", "customers", "leads", "attendance"
  ],
  TECHNICIAN: [
    "dashboard", "jobs", "attendance"
  ],
  QUALITY_INSPECTOR: [
    "dashboard", "jobs", "carin"
  ],
  BILLING_EXECUTIVE: [
    "dashboard", "billing", "payments", "reports"
  ],
  INVENTORY_EXECUTIVE: [
    "dashboard", "inventory", "reports"
  ],
};

export function normalizeRole(role: string): string {
  const base = ((role || "").split("|")[0] ?? "").trim().toUpperCase();
  const aliasMap: Record<string, string> = {
    RECEPTIONIST: "RECEPTION_EXECUTIVE",
    QC: "QUALITY_INSPECTOR",
    QC_INSPECTOR: "QUALITY_INSPECTOR",
    QUALITY_ASSURANCE: "QUALITY_INSPECTOR",
    BILLING: "BILLING_EXECUTIVE",
    INVENTORY: "INVENTORY_EXECUTIVE",
  };
  return aliasMap[base] || base;
}

// Centralized role permission resolver
export async function resolveUserPermissions(userId: string, role: string): Promise<string[]> {
  const canonicalRole = normalizeRole(role);

  // Super Admin retains full, unconditional system access
  if (canonicalRole === "SUPER_ADMIN") {
    return ALL_MODULES;
  }

  try {
    const rp = await db.rolePermission.findUnique({
      where: { role: canonicalRole },
    });
    
    if (rp && Array.isArray(rp.permissions)) {
      return rp.permissions;
    }
  } catch (err) {
    logger.error(`Error resolving user permissions: ${err}`);
  }
  
  return FALLBACK_ROLE_MATRIX[canonicalRole] || [];
}

// Sentinel representing "every action is allowed" for the action-level
// permission model (Phase 1B). SUPER_ADMIN is unconditional by design
// throughout this codebase (see requireRole/requirePermission); the future
// requireAction() middleware (Phase 1A) must treat this sentinel - or the
// SUPER_ADMIN role itself, ahead of consulting this list - as "always allow",
// consistent with how requirePermission() already bypasses SUPER_ADMIN before
// checking membership in any list.
export const ALL_ACTIONS = "*";

export interface ActionPermissionInputs {
  role: string;
  userPermission?: { actions: string[]; actionsOverride: boolean } | null;
  rolePermission?: { actions: string[] } | null;
}

export function resolveActionPermissionsPure(input: ActionPermissionInputs): string[] {
  const baseRole = (input.role || "").split("|")[0] || "";

  if (baseRole === "SUPER_ADMIN") {
    return [ALL_ACTIONS];
  }

  if (input.userPermission?.actionsOverride === true) {
    return input.userPermission.actions;
  }

  return input.rolePermission?.actions ?? [];
}

export async function resolveActionPermissions(userId: string, role: string): Promise<string[]> {
  try {
    const baseRole = role.split("|")[0] || "";
    const [userPermission, rolePermission] = await Promise.all([
      db.userPermission.findUnique({ where: { employeeId: userId }, select: { actions: true, actionsOverride: true } }),
      db.rolePermission.findUnique({ where: { role: baseRole }, select: { actions: true } }),
    ]);
    return resolveActionPermissionsPure({ role, userPermission, rolePermission });
  } catch (err) {
    logger.error(`Error resolving action permissions: ${err}`);
    return []; // fail closed, not fail open
  }
}
