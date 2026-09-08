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
    SERVICE_ADVISOR: ["dashboard", "carin", "jobs", "outpass", "customers", "leads", "attendance"],
    TECHNICIAN: ["dashboard", "jobs", "attendance"],
    QUALITY_INSPECTOR: ["dashboard", "jobs", "carin"],
    BILLING_EXECUTIVE: ["dashboard", "billing", "payments", "reports"],
    INVENTORY_EXECUTIVE: ["dashboard", "inventory", "reports"],
  };
  
  const base = role.split("|")[0] || "";
  return fallbackMatrix[base] || [];
}

// Sentinel representing "every action is allowed" for the action-level
// permission model (Phase 1B). SUPER_ADMIN is unconditional by design
// throughout this codebase (see requireRole/requirePermission); the future
// requireAction() middleware (Phase 1A) must treat this sentinel — or the
// SUPER_ADMIN role itself, ahead of consulting this list — as "always allow",
// consistent with how requirePermission() already bypasses SUPER_ADMIN before
// checking membership in any list.
export const ALL_ACTIONS = "*";

export interface ActionPermissionInputs {
  role: string;
  userPermission?: { actions: string[]; actionsOverride: boolean } | null;
  rolePermission?: { actions: string[] } | null;
}

// Pre-flight Patch C — pure resolver for the action-level permission model.
// Deliberately takes plain data rather than fetching from the DB itself, so
// it can be unit-tested with zero database dependency. The DB-backed wrapper
// (resolveActionPermissions below) is what real call sites use.
//
// Precedence:
//   1. SUPER_ADMIN                                -> ALL_ACTIONS
//   2. UserPermission exists AND actionsOverride   -> that employee's actions, verbatim (even [])
//   3. otherwise                                   -> RolePermission.actions for the role
//   4. no RolePermission row for the role          -> [] (fail closed)
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

// DB-backed wrapper — resolves the same way resolveUserPermissions() does
// for the legacy module list, but for the new action-level list. Not yet
// called from any route or middleware (Phase 1A wires requireAction() to
// this); adding it here is inert until that happens.
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


