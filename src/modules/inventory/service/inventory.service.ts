import { InventoryRepository } from '../repository/inventory.repository.js';
import type { CreateInventoryDTO, UpdateInventoryDTO } from '../validation/inventory.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import { db } from '../../../lib/db.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { sendNotification } from '../../../shared/services/notification.service.js';

export class InventoryService {
  constructor(private readonly repository: InventoryRepository = new InventoryRepository()) {}

  async getAllItems() {
    return this.repository.findAll();
  }

  async createItem(data: CreateInventoryDTO, userId: string = "system") {
    const itmId = generateUid("ITM");
    const item = await this.repository.create(itmId, data);
    
    // Log movement
    await db.inventoryMovement.create({
      data: {
        itemId: item.id,
        type: "ADD",
        reference: "MANUAL_CREATE",
        quantity: item.stock,
        balance: item.stock,
        performedBy: userId,
      }
    });

    return item;
  }

  async updateItem(id: string, data: UpdateInventoryDTO, userId: string = "system") {
    const oldItem = await db.inventory.findUnique({ where: { id } });
    const item = await this.repository.update(id, data);
    
    if (oldItem && oldItem.stock !== item.stock) {
      const diff = item.stock - oldItem.stock;
      await db.inventoryMovement.create({
        data: {
          itemId: item.id,
          type: "ADJUST",
          reference: "MANUAL_UPDATE",
          quantity: diff,
          balance: item.stock,
          performedBy: userId,
        }
      });
    }

    return item;
  }

  async deleteItem(id: string) {
    return this.repository.softDelete(id);
  }

  // ═══════════════════════════════════════════════════════════════
  // INVENTORY REQUESTS & APPROVALS WORKFLOW
  // ═══════════════════════════════════════════════════════════════

  async createRequest(data: {
    itemId: string;
    quantityRequested: number;
    requiredDate?: string;
    priority?: string;
    remarks?: string;
    status?: string;
  }, franchiseId: string | null) {
    const request = await db.inventoryRequest.create({
      data: {
        itemId: data.itemId,
        quantityRequested: Number(data.quantityRequested),
        status: data.status || "Submitted",
        date: new Date(),
        requiredDate: data.requiredDate ? new Date(data.requiredDate) : null,
        priority: data.priority || "Medium",
        remarks: data.remarks || null,
        franchiseId,
      }
    });

    const item = await db.inventory.findUnique({ where: { id: data.itemId } });
    if (request.status === "Submitted" || request.status === "Pending") {
      await sendNotification("HQ", "Pending Stock Request", `Branch requested ${data.quantityRequested} of item ${item?.name || data.itemId}.`);
    }
    return request;
  }

  async getRequests(userRole: string, userFranchiseId?: string) {
    const conditions: any = { isDeleted: false };
    if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER" && userFranchiseId) {
      conditions.franchiseId = userFranchiseId;
    }
    return db.inventoryRequest.findMany({
      where: conditions,
      orderBy: { date: "desc" },
    });
  }

  async approveRequest(id: string, data?: { status?: string; quantityApproved?: number }) {
    const status = data?.status || "Approved";
    const quantityApproved = data?.quantityApproved !== undefined ? Number(data.quantityApproved) : undefined;
    const req = await db.inventoryRequest.update({
      where: { id },
      data: {
        status,
        quantityApproved
      }
    });

    if (req.franchiseId) {
      await db.notification.create({
        data: {
          userId: req.franchiseId,
          title: "Product Request Updated",
          message: `Your request for item ID ${req.itemId} status changed to: ${status}.`,
          read: false
        }
      });
    }
    return req;
  }

  async rejectRequest(id: string) {
    const req = await db.inventoryRequest.update({
      where: { id },
      data: { status: "Rejected" }
    });

    if (req.franchiseId) {
      await db.notification.create({
        data: {
          userId: req.franchiseId,
          title: "Product Request Rejected",
          message: `Your request for item ID ${req.itemId} was rejected by Headquarters.`,
          read: false
        }
      });
    }
    return req;
  }

  async dispatchRequest(id: string) {
    const req = await db.inventoryRequest.update({
      where: { id },
      data: { status: "Dispatched" }
    });

    if (req.franchiseId) {
      await db.notification.create({
        data: {
          userId: req.franchiseId,
          title: "Product Request Dispatched",
          message: `Your requested stock for item ID ${req.itemId} has been dispatched.`,
          read: false
        }
      });
    }
    return req;
  }

  async receiveRequest(requestId: string, userId: string) {
    return db.$transaction(async (tx) => {
      const request = await tx.inventoryRequest.findUnique({
        where: { id: requestId }
      });
      if (!request) throw new NotFoundError("Inventory request not found");
      if (request.status !== "Dispatched" && request.status !== "Approved" && request.status !== "Partially Approved") {
        throw new ValidationError("Request must be Approved, Partially Approved, or Dispatched to confirm receipt");
      }

      // Lock item in database
      const item = await tx.inventory.findFirst({
        where: { id: request.itemId }
      });
      if (!item) throw new NotFoundError("Item not found");

      const qtyToAdd = request.quantityApproved !== null ? request.quantityApproved : request.quantityRequested;

      const updatedItem = await tx.inventory.update({
        where: { id: request.itemId },
        data: { stock: item.stock + qtyToAdd }
      });

      // Update request status
      const updatedRequest = await tx.inventoryRequest.update({
        where: { id: requestId },
        data: { status: "Received" }
      });

      // Log movement
      await tx.inventoryMovement.create({
        data: {
          itemId: request.itemId,
          type: "RECEIVE",
          reference: `REQ-${requestId}`,
          quantity: request.quantityRequested,
          balance: updatedItem.stock,
          performedBy: userId
        }
      });

      return updatedRequest;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // NEGATIVE STOCK PROTECTION CONSUMPTION
  // ═══════════════════════════════════════════════════════════════

  async consumeItem(id: string, quantity: number, reference: string, userId: string) {
    return db.$transaction(async (tx) => {
      // Pessimistic transaction lock
      const item = await tx.inventory.findFirst({
        where: { id },
      });

      if (!item) throw new NotFoundError("Item not found");

      if (item.stock < quantity) {
        throw new ValidationError(`Insufficient stock for ${item.name}. Available: ${item.stock}, Required: ${quantity}`);
      }

      const updated = await tx.inventory.update({
        where: { id },
        data: { stock: item.stock - quantity },
      });

      // Low stock notification trigger
      if (updated.stock <= updated.reorder) {
        await tx.notification.create({
          data: {
            userId: "HQ",
            title: "Low Stock Alert",
            message: `Item ${updated.name} stock level has dropped to ${updated.stock} (reorder point: ${updated.reorder}).`,
            read: false
          }
        });
      }

      // Log movement
      await tx.inventoryMovement.create({
        data: {
          itemId: id,
          type: "CONSUME",
          reference,
          quantity: -quantity,
          balance: updated.stock,
          performedBy: userId,
        }
      });

      return updated;
    });
  }

  async getMovements(itemId?: string) {
    return db.inventoryMovement.findMany({
      where: itemId ? { itemId } : undefined,
      orderBy: { performedAt: "desc" }
    });
  }
}
