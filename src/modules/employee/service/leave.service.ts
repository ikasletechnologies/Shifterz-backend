import { db } from '../../../lib/db.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';

export class LeaveService {
  async requestLeave(data: {
    employeeId: string;
    startDate: string;
    endDate: string;
    reason: string;
    franchiseId: string | null;
  }) {
    if (!data.employeeId || !data.startDate || !data.endDate) {
      throw new ValidationError("Employee ID, Start Date, and End Date are required.");
    }

    return db.leaveRequest.create({
      data: {
        employeeId: data.employeeId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        reason: data.reason,
        status: "Pending",
        franchiseId: data.franchiseId,
      },
      include: { employee: true }
    });
  }

  async getLeaves(userRole: string, userFranchiseId?: string) {
    const conditions: any = { isDeleted: false };
    if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER" && userFranchiseId) {
      conditions.franchiseId = userFranchiseId;
    }

    return db.leaveRequest.findMany({
      where: conditions,
      include: { employee: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async updateLeaveStatus(id: string, status: string, userRole: string, userFranchiseId?: string) {
    const leave = await db.leaveRequest.findUnique({ where: { id } });
    if (!leave) throw new NotFoundError("Leave request not found");

    // Franchise admins can only approve their own employees' leaves
    if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER" && leave.franchiseId !== userFranchiseId) {
      throw new ValidationError("You do not have permission to modify leave requests outside your franchise.");
    }

    return db.leaveRequest.update({
      where: { id },
      data: { status },
      include: { employee: true }
    });
  }
}
