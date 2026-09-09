import { TransferRepository } from '../repository/transfer.repository.js';
import { EmployeeService } from './employee.service.js';
import type { CreateTransferDTO, UpdateTransferDTO } from '../validation/transfer.validation.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import bcrypt from 'bcrypt';

export class TransferService {
  constructor(
    private readonly repository: TransferRepository = new TransferRepository(),
    private readonly employeeService: EmployeeService = new EmployeeService()
  ) {}

  async getAllTransfers() {
    const requests = await this.repository.findAll();
    
    return Promise.all(requests.map(async (r) => {
      let empName = r.newMemberName || "Unknown";
      let empRole = r.role || "TECHNICIAN";
      
      if (r.employeeId) {
        const emp = await this.repository.findEmployeeById(r.employeeId);
        if (emp) {
          empName = emp.name;
          empRole = emp.role;
        }
      }

      let toFranchise = null;
      if (r.toFranchiseId) {
        toFranchise = await this.repository.findFranchiseById(r.toFranchiseId);
      }

      return {
        ...r,
        employeeName: empName,
        employeeRole: empRole,
        toFranchiseName: toFranchise?.name || "Unknown",
        toFranchiseCity: toFranchise?.city || "Unknown"
      };
    }));
  }

  async createTransfer(data: CreateTransferDTO, username: string, role: string) {
    const requester = username || role || "Admin";
    return this.repository.create(data, requester);
  }

  async approveTransfer(id: string, userRole: string) {
    const request = await this.repository.findRequestById(id);
    if (!request) throw new NotFoundError("Transfer request not found");
    if (request.status !== "Pending") throw new ApiError(400, `Request already ${request.status.toLowerCase()}`);
    if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER") throw new ApiError(403, "Only HQ can approve member transfers");

    // Do the license check (and the actual provisioning) BEFORE flipping the
    // request to "Approved" — a cap rejection must leave the request
    // "Pending" so it can be retried/inspected, not stuck "Approved" with no
    // employee ever created and no way to re-run this (retry requires status
    // === "Pending").
    let createdEmployee: any = null;
    if (request.employeeId) {
      // Existing employee
      await this.repository.updateEmployeeFranchise(request.employeeId, request.toFranchiseId);
    } else {
      // New member creation — EPB 2.3: this is still employee creation, so it
      // must clear the same license cap a direct create request would.
      const role = request.role || "TECHNICIAN";
      const franchiseId = request.toFranchiseId || null;
      await this.employeeService.assertLicenseCapacity(role, franchiseId);

      const empId = `EMP${Date.now().toString().slice(-6)}`;
      const rawPassword = request.password || "pass123";
      const hashedPassword = await bcrypt.hash(rawPassword, 10);
      const normalizedUsername = request.username ? String(request.username).trim().toLowerCase() : null;

      const newEmployee = await this.repository.createEmployeeFromTransfer({
        empId,
        name: request.newMemberName || "New Member",
        phone: request.newMemberPhone || null,
        email: request.newMemberEmail || null,
        username: normalizedUsername,
        password: hashedPassword,
        role,
        franchiseId
      });
      const { password, ...rest } = newEmployee as any;
      createdEmployee = rest;
    }

    await this.repository.updateRequestStatus(id, "Approved");

    return { success: true, message: "Request approved and user provisioned.", employee: createdEmployee };
  }

  async rejectTransfer(id: string, userRole: string) {
    const request = await this.repository.findRequestById(id);
    if (!request) throw new NotFoundError("Transfer request not found");
    if (request.status !== "Pending") throw new ApiError(400, `Request already ${request.status.toLowerCase()}`);
    if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER") throw new ApiError(403, "Only HQ can reject member transfers");

    await this.repository.updateRequestStatus(id, "Rejected");
    return { success: true, message: "Request rejected" };
  }

  async updateTransfer(id: string, data: UpdateTransferDTO) {
    return this.repository.updateRequest(id, data);
  }

  async deleteTransfer(id: string) {
    return this.repository.softDelete(id);
  }
}
