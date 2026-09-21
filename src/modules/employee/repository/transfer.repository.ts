import { db } from '../../../lib/db.js';
import type { CreateTransferDTO, UpdateTransferDTO } from '../validation/transfer.validation.js';

export class TransferRepository {
  async findAll(tenantFilter: any = {}) {
    return db.memberTransferRequest.findMany({
      where: { isDeleted: false, ...tenantFilter },
      orderBy: { createdAt: "desc" }
    });
  }

  async findEmployeeById(id: string) {
    return db.employee.findUnique({
      where: { id },
      select: { name: true, role: true }
    });
  }

  async findFranchiseById(id: string) {
    return db.franchise.findUnique({
      where: { id },
      select: { name: true, city: true }
    });
  }

  async create(data: CreateTransferDTO, requester: string) {
    // panNumber/aadharNumber/address/panDocUrl/aadharDocUrl are accepted by
    // the request schema but do not exist as columns on MemberTransferRequest
    // (see prisma/schema.prisma) — passing them here makes Prisma reject the
    // whole create() call at runtime ("Unknown argument"), so every transfer
    // request would fail. Only pass fields the model actually has.
    return db.memberTransferRequest.create({
      data: {
        employeeId: data.employeeId || null,
        fromFranchiseId: null,
        toFranchiseId: data.toFranchiseId || null,
        newMemberName: data.newMemberName || null,
        newMemberPhone: data.newMemberPhone || null,
        newMemberEmail: data.newMemberEmail || null,
        username: data.username || null,
        password: data.password || null,
        role: data.role || "TECHNICIAN",
        requestedBy: requester,
        date: new Date().toISOString().split("T")[0] || "",
        status: "Pending"
      }
    });
  }

  async findRequestById(id: string) {
    return db.memberTransferRequest.findUnique({ where: { id } });
  }

  async updateRequestStatus(id: string, status: string, tx?: import('@prisma/client').Prisma.TransactionClient) {
    const client = tx || db;
    return client.memberTransferRequest.update({
      where: { id },
      data: { status }
    });
  }

  async updateRequest(id: string, data: UpdateTransferDTO) {
    return db.memberTransferRequest.update({
      where: { id },
      data
    });
  }

  async createEmployeeFromTransfer(data: any, tx?: import('@prisma/client').Prisma.TransactionClient) {
    const client = tx || db;
    return client.employee.create({
      data: {
        id: data.empId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        status: "Active",
        username: data.username,
        password: data.password,
        role: data.role,
        franchiseId: data.franchiseId,
        permission: {
          create: { modules: [] }
        }
      }
    });
  }

  async updateEmployeeFranchise(employeeId: string, franchiseId: string | null, tx?: import('@prisma/client').Prisma.TransactionClient) {
    const client = tx || db;
    return client.employee.update({
      where: { id: employeeId },
      data: { franchiseId }
    });
  }

  async softDelete(id: string) {
    return db.memberTransferRequest.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date().toISOString() }
    });
  }
}
