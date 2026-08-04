import { db } from '../../../lib/db.js';
import type { CreateEmployeeDTO, UpdateEmployeeDTO } from '../validation/employee.validation.js';

export class EmployeeRepository {
  async findAllEmployees(tenantFilter: any) {
    return db.employee.findMany({
      where: tenantFilter,
      orderBy: { id: "asc" },
      include: {
        franchise: { select: { id: true, name: true, city: true } },
        permission: true
      }
    });
  }

  async findHqEmployees() {
    return db.employee.findMany({
      where: {
        franchiseId: null,
        isDeleted: false,
        status: "Active"
      },
      orderBy: { name: "asc" }
    });
  }

  async findTechnicians() {
    return db.employee.findMany(); // The original GET /technicians returned all employees for some reason
  }

  async countFranchiseUsers(franchiseId: string) {
    return db.employee.count({ where: { franchiseId } });
  }

  async create(id: string, data: any, hashedPassword: string | null, normalizedUsername: string | null) {
    return db.employee.create({
      data: {
        id,
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        status: data.status || "Active",
        username: normalizedUsername,
        password: hashedPassword,
        role: data.role || "TECHNICIAN",
        franchiseId: data.franchiseId,
        gender: data.gender || null,
        dob: data.dob ? new Date(data.dob) : null,
        doj: data.doj ? new Date(data.doj) : null,
        department: data.department || null,
        designation: data.designation || null,
        reportingManager: data.reportingManager || null,
        permission: {
          create: {
            modules: data.permissions || [],
          }
        }
      },
      include: {
        permission: true
      }
    });
  }

  async update(id: string, data: any) {
    return db.employee.update({
      where: { id },
      data,
      include: {
        permission: true
      }
    });
  }

  async updatePermissions(employeeId: string, modules: string[]) {
    return db.userPermission.upsert({
      where: { employeeId },
      update: { modules },
      create: { employeeId, modules }
    });
  }

  async softDelete(id: string) {
    return db.employee.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date().toISOString() }
    });
  }
}
