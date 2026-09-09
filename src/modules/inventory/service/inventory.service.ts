import { InventoryRepository } from '../repository/inventory.repository.js';
import type { CreateInventoryDTO, UpdateInventoryDTO } from '../validation/inventory.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import { db } from '../../../lib/db.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { sendNotification } from '../../../shared/services/notification.service.js';
import { resolveDataScope, scopeWhere, type ScopeActor } from '../../../shared/scope/dataScope.js';
import { assertDispatchableStatus, assertReceivableStatus, resolveFulfillQuantity, assertSufficientHqStock } from './dispatch.helper.js';
import { resolveMovementScope } from './movementScope.helper.js';
import { assertPositiveQuantity, assertSubmittedStatus, resolveApprovalOutcome } from './productRequest.helper.js';
import { assertNotSelfApprover } from './adjustment.helper.js';
import type { CreateProductRequestDTO, ApproveProductRequestDTO } from '../validation/inventory.validation.js';

type ActingUser = ScopeActor & { id?: string; name?: string };

export class InventoryService {
  constructor(private readonly repository: InventoryRepository = new InventoryRepository()) {}

  // INV-01A — canonical scope cleanup: reuses resolveDataScope()/scopeWhere()
  // instead of a locally-duplicated version of the same "SUPER_ADMIN/HQ_USER
  // unrestricted, else own franchise" rule (the exact drift risk already
  // fixed for ReportController during GST-11).
  async getAllItems(actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    return this.repository.findAll({ isDeleted: false, ...scopeWhere(scope) });
  }

  // INV-02 — atomicity fix. The stock-affecting write and its movement
  // record used to be two separate, unwrapped calls; a failure of the
  // second after the first already committed left a stock change with no
  // ledger entry. Wrapped in one transaction so both succeed or neither
  // does, matching the pattern dispatchRequest/receiveRequest/consumeItem
  // already used.
  async createItem(data: CreateInventoryDTO, userId: string = "system", actor?: ScopeActor) {
    const itmId = generateUid("ITM");
    const franchiseId = resolveDataScope(actor).franchiseId;

    return db.$transaction(async (tx) => {
      const item = await this.repository.create(itmId, data, franchiseId, tx);

      await tx.inventoryMovement.create({
        data: {
          itemId: item.id,
          type: "ADD",
          reference: "MANUAL_CREATE",
          quantity: item.stock,
          balance: item.stock,
          performedBy: userId,
          franchiseId: item.franchiseId,
        }
      });

      return item;
    });
  }

  // INV-04 — this path no longer accepts `stock` at all (UpdateInventoryDTO
  // no longer has the field, and the repository's update() no longer
  // writes it): every stock quantity change now goes through
  // InventoryAdjustmentService's request/approve workflow, which is the
  // only place Inventory.stock changes outside item creation, dispatch,
  // receipt, and consumption. This is metadata-only now (name, unit,
  // category, reorder, cost, supplier, location), so there's no longer a
  // second write to keep atomic with — a plain findById-then-update, same
  // shape as deleteItem.
  async updateItem(id: string, data: UpdateInventoryDTO, userId: string = "system", actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    const oldItem = await this.repository.findById(id, scopeWhere(scope));
    if (!oldItem) throw new NotFoundError("Inventory item not found");

    return this.repository.update(id, data);
  }

  async deleteItem(id: string, actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    const existing = await this.repository.findById(id, scopeWhere(scope));
    if (!existing) throw new NotFoundError("Inventory item not found");
    return this.repository.softDelete(id);
  }

  // ═══════════════════════════════════════════════════════════════
  // INVENTORY REQUESTS & APPROVALS WORKFLOW
  // ═══════════════════════════════════════════════════════════════

  // INV-05 — this used to trust a client-supplied `status` directly
  // (allowing a request to be created already "Dispatched"/"Received",
  // bypassing HQ review and enabling self-service stock inflation via a
  // follow-up receiveRequest call) and never checked that `itemId`
  // referred to an item the requesting franchise actually owns. Status is
  // now always "Submitted"; the item lookup is scoped the same way
  // InventoryAdjustmentService.createRequest already does it.
  async createRequest(data: CreateProductRequestDTO, actor?: ActingUser) {
    assertPositiveQuantity(data.quantityRequested);
    const scope = resolveDataScope(actor);
    const item = await db.inventory.findFirst({
      where: { id: data.itemId, isDeleted: false, ...scopeWhere(scope) },
    });
    if (!item) throw new NotFoundError("Inventory item not found");

    const request = await db.inventoryRequest.create({
      data: {
        itemId: data.itemId,
        quantityRequested: data.quantityRequested,
        status: "Submitted",
        date: new Date(),
        requiredDate: data.requiredDate ? new Date(data.requiredDate) : null,
        priority: data.priority || "Medium",
        remarks: data.remarks || null,
        franchiseId: item.franchiseId,
        requestedById: actor?.id || null,
        requestedBy: actor?.name || null,
      }
    });

    await sendNotification("HQ", "Pending Stock Request", `Branch requested ${data.quantityRequested} of item ${item.name}.`);
    return request;
  }

  async getRequests(actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    return db.inventoryRequest.findMany({
      where: { isDeleted: false, ...scopeWhere(scope) },
      orderBy: { date: "desc" },
    });
  }

  // INV-05 — status used to be a second client-supplied override (on top
  // of the createRequest one), with quantityApproved never validated
  // against the requested quantity or checked for a negative value, and no
  // precondition that the request was even still "Submitted". Status is
  // now always derived from quantityApproved (rule D), the request must be
  // "Submitted", and the acting approver may not be the same identity that
  // raised the request.
  async approveRequest(id: string, data: ApproveProductRequestDTO, actor: ActingUser) {
    const request = await db.inventoryRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError("Inventory request not found");
    assertSubmittedStatus(request.status);
    assertNotSelfApprover(request.requestedById, actor.id);

    const status = resolveApprovalOutcome(request.quantityRequested, data.quantityApproved);

    const req = await db.inventoryRequest.update({
      where: { id },
      data: {
        status,
        quantityApproved: data.quantityApproved,
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

  async rejectRequest(id: string, actor: ActingUser) {
    const request = await db.inventoryRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError("Inventory request not found");
    assertSubmittedStatus(request.status);
    assertNotSelfApprover(request.requestedById, actor.id);

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

  // INV-01A — phantom-stock fix. Previously this only flipped the request's
  // status; nothing ever decremented HQ's own stock, so every fulfilled
  // request created new stock at the franchise (via receiveRequest, below)
  // without removing the equivalent quantity from HQ — the system-wide
  // total silently grew with every dispatch. HQ's corresponding item is
  // matched by name + franchiseId:null, the same convention already used by
  // the purchase-order receive handler (hq.ts) to find "the HQ inventory row
  // for this item" — not a new pattern. Fails closed (mirrors consumeItem's
  // existing insufficient-stock guard) rather than dispatching stock HQ
  // doesn't have.
  async dispatchRequest(id: string, userId: string = "system") {
    return db.$transaction(async (tx) => {
      const req = await tx.inventoryRequest.findUnique({ where: { id } });
      if (!req) throw new NotFoundError("Inventory request not found");
      assertDispatchableStatus(req.status);

      const franchiseItem = await tx.inventory.findFirst({ where: { id: req.itemId } });
      if (!franchiseItem) throw new NotFoundError("Requested item not found");

      const qtyToDispatch = resolveFulfillQuantity(req);

      const hqItem = await tx.inventory.findFirst({
        where: { name: franchiseItem.name, franchiseId: null, isDeleted: false },
      });
      assertSufficientHqStock(hqItem, franchiseItem.name, qtyToDispatch);

      const updatedHqItem = await tx.inventory.update({
        where: { id: hqItem.id },
        data: { stock: hqItem.stock - qtyToDispatch },
      });

      // INV-02 — the movement's own franchiseId is the *destination*
      // franchise (req.franchiseId), not the HQ item's franchiseId (null).
      // This is what makes the dispatch auditable by the receiving
      // franchise even though the row it decrements is HQ's own item.
      await tx.inventoryMovement.create({
        data: {
          itemId: hqItem.id,
          type: "DISPATCH",
          reference: `REQ-${id}`,
          quantity: -qtyToDispatch,
          balance: updatedHqItem.stock,
          performedBy: userId,
          franchiseId: req.franchiseId,
        },
      });

      const updatedReq = await tx.inventoryRequest.update({
        where: { id },
        data: { status: "Dispatched" },
      });

      if (updatedReq.franchiseId) {
        await tx.notification.create({
          data: {
            userId: updatedReq.franchiseId,
            title: "Product Request Dispatched",
            message: `Your requested stock for item ID ${updatedReq.itemId} has been dispatched.`,
            read: false,
          },
        });
      }

      return updatedReq;
    });
  }

  // INV-02 — receipt is now only reachable after dispatchRequest has run
  // (status must be exactly "Dispatched"), so HQ stock is guaranteed to
  // have already been decremented before a franchise can add the
  // corresponding stock on their side — previously "Approved"/"Partially
  // Approved" were also accepted here, which let a franchise self-report
  // receipt (and inflate their own stock) without HQ ever dispatching.
  // The movement's own quantity now matches what actually moved
  // (qtyToAdd), not the original quantityRequested.
  async receiveRequest(requestId: string, userId: string, actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    return db.$transaction(async (tx) => {
      const request = await tx.inventoryRequest.findFirst({
        where: { id: requestId, ...scopeWhere(scope) }
      });
      if (!request) throw new NotFoundError("Inventory request not found");
      assertReceivableStatus(request.status);

      // Lock item in database
      const item = await tx.inventory.findFirst({
        where: { id: request.itemId }
      });
      if (!item) throw new NotFoundError("Item not found");

      const qtyToAdd = resolveFulfillQuantity(request);

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
          quantity: qtyToAdd,
          balance: updatedItem.stock,
          performedBy: userId,
          franchiseId: item.franchiseId,
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
          franchiseId: updated.franchiseId,
        }
      });

      return updated;
    });
  }

  // INV-01A — franchise-scope fix. Previously unscoped: any authenticated
  // user could see every franchise's movement history. InventoryMovement has
  // no franchiseId column of its own, so scope is applied the same way
  // ReportRepository.getInventoryMovements already does it — by joining
  // through the item's own franchiseId — reusing that existing convention
  // rather than inventing a second one.
  async getMovements(userRole: string, userFranchiseId?: string | null, itemId?: string) {
    const needsScope = userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER" && !!userFranchiseId;
    const scopedItemIds = needsScope
      ? (await db.inventory.findMany({
          where: { franchiseId: userFranchiseId, isDeleted: false },
          select: { id: true },
        })).map((i) => i.id)
      : [];

    const resolved = resolveMovementScope(userRole, userFranchiseId, itemId, scopedItemIds);
    if (resolved.empty) return [];

    return db.inventoryMovement.findMany({
      where: resolved.where,
      orderBy: { performedAt: "desc" }
    });
  }
}
