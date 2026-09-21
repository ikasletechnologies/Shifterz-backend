import { db } from "../../lib/db.js";
// Wait, the original code used import { db } from "../lib/db.js". I'll use that.
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

// Re-using the db instance from the legacy code for now

export class AuthRepository {
  async findEmployeeByUsername(username: string) {
    return db.employee.findUnique({
      where: { username },
      include: { permission: true, franchise: true },
    });
  }

  async findEmployeeById(id: string) {
    return db.employee.findUnique({
      where: { id },
      include: { permission: true, franchise: true },
    });
  }

  async updateEmployee(id: string, data: any) {
    return db.employee.update({
      where: { id },
      data,
    });
  }

  async findAllRolePermissions() {
    return db.rolePermission.findMany();
  }

  async upsertRolePermission(role: string, permissions: string[]) {
    return db.rolePermission.upsert({
      where: { role },
      update: { permissions },
      create: { role, permissions },
    });
  }

  // RBAC-02 — separate, action-specific method rather than overloading the
  // legacy upsertRolePermission above: that method's `permissions` argument
  // is the old module-permission list, a completely different field and
  // concept from RolePermission.actions (the RBAC-01 action catalog this
  // method writes). The update branch touches only `actions`, so an
  // existing role's `permissions` is never read, written, or otherwise
  // disturbed by this call.
  async findRolePermission(role: string) {
    return db.rolePermission.findUnique({ where: { role } });
  }

  async upsertRoleActionPermissions(role: string, actions: string[], tx?: Prisma.TransactionClient) {
    const client = tx ?? db;
    return client.rolePermission.upsert({
      where: { role },
      update: { actions },
      create: { role, permissions: [], actions },
    });
  }
}

export const authRepository = new AuthRepository();
