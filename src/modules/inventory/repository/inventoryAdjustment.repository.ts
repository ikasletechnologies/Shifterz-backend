import { db } from '../../../lib/db.js';
import type { Prisma } from '@prisma/client';

type FranchiseScopeWhere = { franchiseId?: string | null };

export class InventoryAdjustmentRepository {
  async create(data: {
    itemId: string;
    requestedQty: number;
    reason: string;
    requestedById: string | null;
    requestedBy: string | null;
    franchiseId: string | null;
  }) {
    return db.inventoryAdjustmentRequest.create({ data: { ...data, status: 'Pending' } });
  }

  async findById(id: string, scopeWhere: FranchiseScopeWhere = {}, tx?: Prisma.TransactionClient) {
    return (tx || db).inventoryAdjustmentRequest.findFirst({
      where: { id, isDeleted: false, ...scopeWhere },
    });
  }

  async list(scopeWhere: FranchiseScopeWhere = {}) {
    return db.inventoryAdjustmentRequest.findMany({
      where: { isDeleted: false, ...scopeWhere },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markApproved(id: string, approvedById: string | null, approvedBy: string | null, tx: Prisma.TransactionClient) {
    return tx.inventoryAdjustmentRequest.update({
      where: { id },
      data: { status: 'Approved', approvedById, approvedBy, approvedAt: new Date() },
    });
  }

  async markRejected(id: string, approvedById: string | null, approvedBy: string | null, rejectionNote: string) {
    return db.inventoryAdjustmentRequest.update({
      where: { id },
      data: { status: 'Rejected', approvedById, approvedBy, approvedAt: new Date(), rejectionNote },
    });
  }

  async markCancelled(id: string) {
    return db.inventoryAdjustmentRequest.update({
      where: { id },
      data: { status: 'Cancelled' },
    });
  }
}
