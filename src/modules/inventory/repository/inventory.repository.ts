import { db } from '../../../lib/db.js';
import type { CreateInventoryDTO, UpdateInventoryDTO } from '../validation/inventory.validation.js';

export class InventoryRepository {
  async findAll(tenantFilter: any) {
    return db.inventory.findMany({
      where: tenantFilter,
    });
  }

  async create(id: string, data: CreateInventoryDTO, franchiseId: string | null) {
    return db.inventory.create({
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

  async update(id: string, data: UpdateInventoryDTO) {
    return db.inventory.update({
      where: { id },
      data: {
        name: data.name,
        unit: data.unit,
        category: data.category,
        stock: data.stock !== undefined ? Number(data.stock) : undefined,
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
