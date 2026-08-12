import { db } from "../../lib/db.js";
// Wait, the original code used import { db } from "../lib/db.js". I'll use that.
import { PrismaClient } from "@prisma/client";

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
}

export const authRepository = new AuthRepository();
