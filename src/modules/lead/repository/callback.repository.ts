import { db } from '../../../lib/db.js';
import type { CreateCallbackDTO, UpdateCallbackDTO } from '../validation/callback.validation.js';

export class CallbackRepository {
  async create(data: CreateCallbackDTO, franchiseId: string | null, createdBy: string) {
    return db.callback.create({
      data: {
        leadId: data.leadId ?? null,
        leadName: data.leadName ?? null,
        customerId: data.customerId ?? null,
        customerName: data.customerName ?? null,
        scheduledAt: new Date(data.scheduledAt),
        reminderNotes: data.reminderNotes,
        assignedToId: data.assignedToId,
        assignedTo: data.assignedTo,
        status: 'Pending',
        franchiseId,
        createdBy,
      },
    });
  }

  async findById(id: string) {
    return db.callback.findUnique({ where: { id } });
  }

  /** All callbacks for a user (as task list) */
  async findByEmployee(assignedToId: string) {
    return db.callback.findMany({
      where: { assignedToId, isDeleted: false },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  /** All callbacks within a franchise (for managers) */
  async findByFranchise(franchiseId: string | null) {
    return db.callback.findMany({
      where: { ...(franchiseId ? { franchiseId } : {}), isDeleted: false },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  /** Callbacks scheduled within a date range */
  async findInRange(
    assignedToId: string | null,
    franchiseId: string | null,
    from: Date,
    to: Date,
  ) {
    return db.callback.findMany({
      where: {
        isDeleted: false,
        scheduledAt: { gte: from, lte: to },
        ...(assignedToId ? { assignedToId } : {}),
        ...(franchiseId ? { franchiseId } : {}),
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  /** Overdue (Pending past their scheduledAt) */
  async markOverdue() {
    return db.callback.updateMany({
      where: {
        status: 'Pending',
        scheduledAt: { lt: new Date() },
        isDeleted: false,
      },
      data: { status: 'Overdue' },
    });
  }

  async update(id: string, data: {
    scheduledAt?: string | Date;
    reminderNotes?: string;
    assignedToId?: string;
    assignedTo?: string;
    status?: string;
    completedAt?: Date | null;
    completedBy?: string | null;
    completedNotes?: string | null;
    rescheduledTo?: Date | null;
  }) {
    return db.callback.update({
      where: { id },
      data: {
        ...(data.scheduledAt && { scheduledAt: new Date(data.scheduledAt) }),
        ...(data.reminderNotes !== undefined && { reminderNotes: data.reminderNotes }),
        ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }),
        ...(data.assignedTo !== undefined && { assignedTo: data.assignedTo }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.completedAt !== undefined && { completedAt: data.completedAt }),
        ...(data.completedBy !== undefined && { completedBy: data.completedBy }),
        ...(data.completedNotes !== undefined && { completedNotes: data.completedNotes }),
        ...(data.rescheduledTo !== undefined && { rescheduledTo: data.rescheduledTo }),
      },
    });
  }


  async softDelete(id: string) {
    return db.callback.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
}
