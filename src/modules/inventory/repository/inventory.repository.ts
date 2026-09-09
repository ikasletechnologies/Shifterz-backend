import { db } from '../../../lib/db.js';
import type { Prisma } from '@prisma/client';
import type { CreateInventoryDTO, UpdateInventoryDTO } from '../validation/inventory.validation.js';

type FranchiseScopeWhere = { franchiseId?: string | null };

export class InventoryRepository {
  async findAll(tenantFilter: any) {
    return db.inventory.findMany({
      where: tenantFilter,
    });
  }

  // INV-02 — optional tx so callers can wrap the read/write pair (findById
  // then update, in updateItem) in a single transaction with the movement
  // record.
  async findById(id: string, scopeWhere: FranchiseScopeWhere = {}, tx?: Prisma.TransactionClient) {
    return (tx || db).inventory.findFirst({ where: { id, isDeleted: false, ...scopeWhere } });
  }

  async create(id: string, data: CreateInventoryDTO, franchiseId: string | null, tx?: Prisma.TransactionClient) {
    return (tx || db).inventory.create({
      data: {
        id,
        name: data.name,
        unit: data.unit || "Piece",
        category: data.category || "Consumable",
        stock: Number(data.stock || 0),
        reorder: Number(data.reorder || 0),
        cost: Number(data.cost || 0),
        supplier: data.supplier || "",
        location: data.location || "",
        franchiseId,
      },
    });
  }

  // INV-04 — no `stock` field: metadata-only, matching UpdateInventoryDTO
  // (see inventory.validation.ts). Stock changes exclusively through
  // InventoryAdjustmentService's approval workflow now.
  async update(id: string, data: UpdateInventoryDTO, tx?: Prisma.TransactionClient) {
    return (tx || db).inventory.update({
      where: { id },
      data: {
        name: data.name,
        unit: data.unit,
        category: data.category,
        reorder: data.reorder !== undefined ? Number(data.reorder) : undefined,
        cost: data.cost !== undefined ? Number(data.cost) : undefined,
        supplier: data.supplier,
        location: data.location,
      },
    });
  }

  async softDelete(id: string) {
    return db.inventory.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date().toISOString() }
    });
  }
}
