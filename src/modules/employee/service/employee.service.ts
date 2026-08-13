import { EmployeeRepository } from '../repository/employee.repository.js';
import type { CreateEmployeeDTO, UpdateEmployeeDTO } from '../validation/employee.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import { db } from '../../../lib/db.js';
import bcrypt from 'bcrypt';
import { UnauthorizedError } from '../../../shared/errors/UnauthorizedError.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { computeStaffPerformance } from '../../../shared/services/staffPerformance.service.js';

const FRANCHISE_ASSIGNABLE_ROLES = [
  "RECEPTION_EXECUTIVE",
  "SERVICE_ADVISOR",
  "TECHNICIAN",
  "QUALITY_INSPECTOR",
  "BILLING_EXECUTIVE",
  "INVENTORY_EXECUTIVE",
];

export interface StaffManagementQuery {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  franchiseId?: string;
  serviceType?: string;
  status?: string;
  page?: string;
  pageSize?: string;
}

export class EmployeeService {
  constructor(private readonly repository: EmployeeRepository = new EmployeeRepository()) { }

  async getAllEmployees(userRole: string, userFranchiseId?: string) {
    let tenantFilter: any = { isDeleted: false };
    if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER" && userFranchiseId) {
      tenantFilter.franchiseId = userFranchiseId;
    }

    const list = await this.repository.findAllEmployees(tenantFilter);
    return list.map(emp => {
      const { password, ...rest } = emp;
      return {
        ...rest,
        permissions: emp.permission?.modules || []
      };
    });
  }

  async getHqEmployees() {
    const list = await this.repository.findHqEmployees();
    return list.map(emp => {
      const { password, ...rest } = emp;
      return rest;
    });
  }

  async getTechnicians() {
    return this.repository.findTechnicians();
  }

  async getTechnicianManagement(userRole: string, userFranchiseId: string | undefined, query: StaffManagementQuery) {
    const tenantFilter: any = {};
    if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER" && userFranchiseId) {
      tenantFilter.franchiseId = userFranchiseId;
    }

    return computeStaffPerformance({
      role: "TECHNICIAN",
      assigneeIdField: "technicianId",
      tenantFilter,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      franchiseId: query.franchiseId,
      serviceType: query.serviceType,
      status: query.status,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });
  }

  async createEmployee(data: CreateEmployeeDTO, userRole: string, userFranchiseId?: string, isTechnicianRoute = false) {
    let franchiseId: string | null = data.franchiseId || null;

    if (!isTechnicianRoute) {
      const isHq = userRole === "SUPER_ADMIN" || userRole === "HQ_USER";
      const isFranchiseAdmin = userRole === "FRANCHISE_ADMIN";

      if (!isHq && !isFranchiseAdmin) {
        throw new UnauthorizedError("Only HQ or a Franchise Admin can create employees");
      }

      if (isFranchiseAdmin) {
        if (!userFranchiseId) {
          throw new UnauthorizedError("Franchise admin account is not linked to a franchise");
        }
        franchiseId = userFranchiseId;
        const requestedRole = data.role || "TECHNICIAN";
        if (!FRANCHISE_ASSIGNABLE_ROLES.includes(requestedRole)) {
          throw new ApiError(403, "Franchise admins can only create Technician, Service Advisor, Reception, QC, Billing, or Inventory accounts.");
        }
      }
    } else {
      franchiseId = userFranchiseId || null;
      if (userRole === "SUPER_ADMIN" || userRole === "HQ_USER") {
        franchiseId = data.franchiseId || null;
      }
    }

    // Dynamic licensing enforcement
    let license = null;
    if (franchiseId) {
      license = await db.license.findFirst({
        where: { organizationId: franchiseId, status: "Active" }
      });
    }

    const limitFranchiseUsers = license ? license.maxFranchiseUsers : 6;
    const limitFranchiseAdmins = license ? license.maxFranchiseAdmins : 1;
    const limitHQUsers = license ? license.maxHQUsers : 6;
    const limitSuperAdmins = license ? license.maxSuperAdmins : 1;

    const roleToCheck = data.role || (isTechnicianRoute ? "TECHNICIAN" : "EMPLOYEE");

    if (roleToCheck === "SUPER_ADMIN") {
      const count = await db.employee.count({ where: { role: "SUPER_ADMIN", isDeleted: false } });
      if (count >= limitSuperAdmins) {
        throw new ApiError(403, `License limit reached. Maximum ${limitSuperAdmins} Super Administrator allowed.`);
      }
    } else if (roleToCheck === "HQ_USER") {
      const count = await db.employee.count({ where: { role: "HQ_USER", isDeleted: false } });
      if (count >= limitHQUsers) {
        throw new ApiError(403, `License limit reached. Maximum ${limitHQUsers} HQ Users allowed.`);
      }
    } else if (franchiseId) {
      if (roleToCheck === "FRANCHISE_ADMIN") {
        const count = await db.employee.count({ where: { franchiseId, role: "FRANCHISE_ADMIN", isDeleted: false } });
        if (count >= limitFranchiseAdmins) {
          throw new ApiError(403, `License limit reached. Maximum ${limitFranchiseAdmins} Franchise Administrator allowed.`);
        }
      } else {
        const count = await db.employee.count({ where: { franchiseId, isDeleted: false } });
        if (count >= limitFranchiseUsers) {
          throw new ApiError(403, `License limit reached. Maximum ${limitFranchiseUsers} users allowed per franchise.`);
        }
      }
    }

    const rawPassword = data.password || (isTechnicianRoute ? "tech123" : null);
    const hashedPassword = rawPassword ? await bcrypt.hash(rawPassword, 10) : null;

    let normalizedUsername = null;
    if (data.username) {
      normalizedUsername = String(data.username).trim().toLowerCase();
      if (normalizedUsername) {
        const existingUsername = await db.employee.findFirst({
          where: { username: normalizedUsername, isDeleted: false }
        });
        if (existingUsername) {
          throw new ApiError(400, `Username '${normalizedUsername}' is already taken by another account.`);
        }
      }
    } else if (isTechnicianRoute && data.name) {
      normalizedUsername = data.name.replace(/\s+/g, "").toLowerCase();
    }

    if (data.email) {
      const trimmedEmail = String(data.email).trim().toLowerCase();
      if (trimmedEmail) {
        const existingEmail = await db.employee.findFirst({
          where: { email: { equals: trimmedEmail, mode: "insensitive" }, isDeleted: false }
        });
        if (existingEmail) {
          throw new ApiError(400, "An employee with this email address already exists.");
        }
      }
    }

    if (data.phone) {
      const trimmedPhone = String(data.phone).trim();
      if (trimmedPhone) {
        const existingPhone = await db.employee.findFirst({
          where: { phone: trimmedPhone, isDeleted: false }
        });
        if (existingPhone) {
          throw new ApiError(400, "An employee with this mobile number already exists.");
        }
      }
    }

    const empId = data.role === "SERVICE_ADVISOR"
      ? generateUid("SA-")
      : isTechnicianRoute
        ? generateUid("TECH")
        : `EMP${Date.now().toString().slice(-6)}`;

    const targetFranchiseId = (franchiseId && franchiseId !== "HQ") ? franchiseId : null;
    const newEmployee = await this.repository.create(empId, { ...data, franchiseId: targetFranchiseId }, hashedPassword, normalizedUsername);
    const { password, ...rest } = newEmployee;

    return {
      ...rest,
      permissions: newEmployee.permission?.modules || []
    };
  }

  async updateEmployee(id: string, data: UpdateEmployeeDTO, userRole = "UNKNOWN", userFranchiseId?: string) {
    const existing = await db.employee.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError("Employee not found");
    }
    if (existing.role === "SUPER_ADMIN") {
      if (data.role && data.role !== "SUPER_ADMIN") {
        throw new ApiError(400, "Super Administrator role cannot be modified.");
      }
      if (data.status && data.status !== "Active") {
        throw new ApiError(400, "Super Administrator cannot be deactivated.");
      }
    }

    if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER" && existing.franchiseId !== userFranchiseId) {
      throw new ApiError(403, "You do not have permission to modify employees outside your franchise.");
    }

    if (userRole === "FRANCHISE_ADMIN") {
      if (!FRANCHISE_ASSIGNABLE_ROLES.includes(existing.role)) {
        throw new ApiError(403, "You do not have permission to modify this account.");
      }
      if (data.role !== undefined && !FRANCHISE_ASSIGNABLE_ROLES.includes(data.role)) {
        throw new ApiError(403, "Franchise admins can only assign Technician, Service Advisor, Reception, QC, Billing, or Inventory roles.");
      }
      if (data.franchiseId !== undefined && data.franchiseId !== userFranchiseId) {
        throw new ApiError(403, "You cannot move an employee to another franchise.");
      }
    }

    const updateData: any = {};

    if (data.name !== undefined) updateData.name = data.name;

    if (data.phone !== undefined) {
      const trimmedPhone = data.phone ? String(data.phone).trim() : "";
      if (trimmedPhone && trimmedPhone !== (existing.phone || "").trim()) {
        const existingPhone = await db.employee.findFirst({
          where: { phone: trimmedPhone, id: { not: id }, isDeleted: false }
        });
        if (existingPhone) {
          throw new ApiError(400, "An employee with this mobile number already exists.");
        }
      }
      updateData.phone = trimmedPhone || null;
    }

    if (data.email !== undefined) {
      const trimmedEmail = data.email ? String(data.email).trim().toLowerCase() : "";
      if (trimmedEmail && trimmedEmail !== (existing.email || "").trim().toLowerCase()) {
        const existingEmail = await db.employee.findFirst({
          where: { email: { equals: trimmedEmail, mode: "insensitive" }, id: { not: id }, isDeleted: false }
        });
        if (existingEmail) {
          throw new ApiError(400, "An employee with this email address already exists.");
        }
      }
      updateData.email = trimmedEmail || null;
    }

    if (data.status !== undefined) updateData.status = data.status;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.gender !== undefined) updateData.gender = data.gender || null;
    if (data.department !== undefined) updateData.department = data.department || null;
    if (data.designation !== undefined) updateData.designation = data.designation || null;
    if (data.reportingManager !== undefined) updateData.reportingManager = data.reportingManager || null;

    if (data.franchiseId !== undefined) {
      updateData.franchiseId = (data.franchiseId && data.franchiseId !== "HQ") ? data.franchiseId : null;
      updateData.hqControlled = updateData.franchiseId === null;
    }

    if (data.dob !== undefined) {
      updateData.dob = data.dob ? new Date(data.dob) : null;
    }

    if (data.doj !== undefined) {
      updateData.doj = data.doj ? new Date(data.doj) : null;
    }

    if (data.username !== undefined) {
      const trimmed = data.username ? String(data.username).trim().toLowerCase() : "";
      const normalized = trimmed || null;
      if (normalized && normalized !== (existing.username || "").trim().toLowerCase()) {
        const existingUsername = await db.employee.findFirst({
          where: { username: normalized, id: { not: id }, isDeleted: false },
        });
        if (existingUsername) {
          throw new ApiError(400, `Username '${normalized}' is already taken by another account.`);
        }
      }
      updateData.username = normalized;
    }

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    const updated = await this.repository.update(id, updateData);

    if (data.permissions) {
      await this.repository.updatePermissions(id, data.permissions);
    }

    const { password, ...rest } = updated;
    return {
      ...rest,
      permissions: data.permissions || updated.permission?.modules || []
    };
  }

  async deleteEmployee(id: string, userRole = "UNKNOWN", userFranchiseId?: string) {
    const existing = await db.employee.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError("Employee not found");
    }
    if (existing.role === "SUPER_ADMIN") {
      throw new ApiError(400, "Super Administrator account cannot be deleted.");
    }

    const isHq = userRole === "SUPER_ADMIN" || userRole === "HQ_USER";
    if (!isHq) {
      const isOwnFranchiseAdmin = userRole === "FRANCHISE_ADMIN" && existing.franchiseId === userFranchiseId;
      if (!isOwnFranchiseAdmin || !FRANCHISE_ASSIGNABLE_ROLES.includes(existing.role)) {
        throw new ApiError(403, "You do not have permission to remove this employee.");
      }
    }

    return this.repository.softDelete(id);
  }

  async getPendingApprovals(userRole: string, statusFilter?: string) {
    const baseRole = userRole.split("|")[0];
    const isHq = baseRole === "SUPER_ADMIN" || baseRole === "HQ_USER" || userRole.includes("SUPER_ADMIN") || userRole.includes("HQ_USER");
    if (!isHq) {
      throw new UnauthorizedError("Only Super Admin or HQ users can view employee pending approvals");
    }
    const list = await this.repository.findPendingApprovals(statusFilter);
    return list.map(emp => {
      const { password, ...rest } = emp;
      return rest;
    });
  }

  async approveRegistration(id: string, userRole: string) {
    const baseRole = userRole.split("|")[0];
    const isHq = baseRole === "SUPER_ADMIN" || baseRole === "HQ_USER" || userRole.includes("SUPER_ADMIN") || userRole.includes("HQ_USER");
    if (!isHq) {
      throw new UnauthorizedError("Only Super Admin or HQ users can approve employee registration");
    }
    const existing = await db.employee.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError("Employee not found");
    }
    const updated = await this.repository.update(id, {
      approvalStatus: "Approved",
      status: "Active",
    });
    const { password, ...rest } = updated;
    return rest;
  }

  async rejectRegistration(id: string, userRole: string) {
    const baseRole = userRole.split("|")[0];
    const isHq = baseRole === "SUPER_ADMIN" || baseRole === "HQ_USER" || userRole.includes("SUPER_ADMIN") || userRole.includes("HQ_USER");
    if (!isHq) {
      throw new UnauthorizedError("Only Super Admin or HQ users can reject employee registration");
    }
    const existing = await db.employee.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError("Employee not found");
    }
    const updated = await this.repository.update(id, {
      approvalStatus: "Rejected",
      status: "Inactive",
    });
    const { password, ...rest } = updated;
    return rest;
  }
}
