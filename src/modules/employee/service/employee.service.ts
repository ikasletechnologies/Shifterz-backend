import { EmployeeRepository } from '../repository/employee.repository.js';
import type { CreateEmployeeDTO, UpdateEmployeeDTO } from '../validation/employee.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import bcrypt from 'bcrypt';
import { UnauthorizedError } from '../../../shared/errors/UnauthorizedError.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { computeStaffPerformance } from '../../../shared/services/staffPerformance.service.js';

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
  constructor(private readonly repository: EmployeeRepository = new EmployeeRepository()) {}

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
      if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER") {
        throw new UnauthorizedError("Only HQ can create employees");
      }
      if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER" && userFranchiseId) {
        franchiseId = userFranchiseId;
      }
    } else {
      franchiseId = userFranchiseId || null;
      if (userRole === "SUPER_ADMIN" || userRole === "HQ_USER") {
        franchiseId = data.franchiseId || null;
      }
      if (franchiseId) {
        const userCount = await this.repository.countFranchiseUsers(franchiseId);
        if (userCount >= 6) {
          throw new ApiError(403, "License limit reached. Maximum 6 users allowed per franchise.");
        }
      }
    }

    const rawPassword = data.password || (isTechnicianRoute ? "tech123" : null);
    const hashedPassword = rawPassword ? await bcrypt.hash(rawPassword, 10) : null;
    
    let normalizedUsername = null;
    if (data.username) {
      normalizedUsername = String(data.username).trim().toLowerCase();
    } else if (isTechnicianRoute && data.name) {
      normalizedUsername = data.name.replace(/\s+/g, "").toLowerCase();
    }

    const empId = isTechnicianRoute ? generateUid("TECH") : `EMP${Date.now().toString().slice(-6)}`;
    
    const newEmployee = await this.repository.create(empId, { ...data, franchiseId }, hashedPassword, normalizedUsername);
    const { password, ...rest } = newEmployee;
    
    return {
      ...rest,
      permissions: newEmployee.permission?.modules || []
    };
  }

  async updateEmployee(id: string, data: UpdateEmployeeDTO) {
    const updateData: any = { ...data };
    delete updateData.permissions;

    if (updateData.username !== undefined) {
      const trimmed = updateData.username ? String(updateData.username).trim().toLowerCase() : "";
      updateData.username = trimmed || null;
    }

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    } else {
      delete updateData.password;
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

  async deleteEmployee(id: string) {
    return this.repository.softDelete(id);
  }
}
