import { InventoryAdjustmentRepository } from '../repository/inventoryAdjustment.repository.js';
import type { CreateAdjustmentDTO } from '../validation/inventoryAdjustment.validation.js';
import { db } from '../../../lib/db.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { resolveDataScope, scopeWhere, type ScopeActor } from '../../../shared/scope/dataScope.js';
import {
  assertApproverAuthority,
  assertPendingRequest,
  assertNotSelfApprover,
  assertRequesterOwnsCancellation,
  assertAdjustmentWithinStock,
  resolveNewStock,
  buildAdjustmentMovementData,
} from './adjustment.helper.js';

type ActingUser = ScopeActor & { id?: string; name?: string };

export class InventoryAdjustmentService {
  constructor(private readonly repository: InventoryAdjustmentRepository = new InventoryAdjustmentRepository()) {}

  // Creation never touches Inventory.stock or InventoryMovement — only
  // approval does (see approveRequest below).
  async createRequest(data: CreateAdjustmentDTO, actor?: ActingUser) {
    const scope = resolveDataScope(actor);
    const item = await db.inventory.findFirst({
      where: { id: data.itemId, isDeleted: false, ...scopeWhere(scope) },
    });
    if (!item) throw new NotFoundError("Inventory item not found");

    return this.repository.create({
      itemId: data.itemId,
      requestedQty: data.requestedQty,
      reason: data.reason,
      requestedById: actor?.id || null,
      requestedBy: actor?.name || null,
      franchiseId: item.franchiseId,
    });
  }

  async getRequests(actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    return this.repository.list(scopeWhere(scope));
  }

  // The only point where inventory changes. One transaction: reload the
  // item under franchise scope, re-check the request is still Pending,
  // block self-approval, re-validate the stock floor against CURRENT
  // stock (not whatever it was when the request was created), write the
  // stock update and exactly one ADJUST movement, then mark the request
  // Approved. Any failure anywhere in this sequence rolls the whole thing
  // back — the request is never left half-applied.
  async approveRequest(id: string, actor: ActingUser) {
    assertApproverAuthority(actor.role);
    const scope = resolveDataScope(actor);

    return db.$transaction(async (tx) => {
      const request = await this.repository.findById(id, scopeWhere(scope), tx);
      if (!request) throw new NotFoundError("Adjustment request not found");
      assertPendingRequest(request.status);
      assertNotSelfApprover(request.requestedById, actor.id);

      const item = await tx.inventory.findFirst({ where: { id: request.itemId } });
      if (!item) throw new NotFoundError("Inventory item not found");

      assertAdjustmentWithinStock(item.stock, request.requestedQty);
      const newStock = resolveNewStock(item.stock, request.requestedQty);

      const updatedItem = await tx.inventory.update({
        where: { id: item.id },
        data: { stock: newStock },
      });

      await tx.inventoryMovement.create({
        data: buildAdjustmentMovementData({
          itemId: item.id,
          requestId: id,
          requestedQty: request.requestedQty,
          newBalance: updatedItem.stock,
          performedBy: actor.id || 'unknown',
          franchiseId: item.franchiseId,
        }),
      });

      return this.repository.markApproved(id, actor.id || null, actor.name || null, tx);
    });
  }

  async rejectRequest(id: string, rejectionNote: string, actor: ActingUser) {
    assertApproverAuthority(actor.role);
    const scope = resolveDataScope(actor);

    const request = await this.repository.findById(id, scopeWhere(scope));
    if (!request) throw new NotFoundError("Adjustment request not found");
    assertPendingRequest(request.status);
    assertNotSelfApprover(request.requestedById, actor.id);

    return this.repository.markRejected(id, actor.id || null, actor.name || null, rejectionNote);
  }

  async cancelRequest(id: string, actor: ActingUser) {
    const scope = resolveDataScope(actor);
    const request = await this.repository.findById(id, scopeWhere(scope));
    if (!request) throw new NotFoundError("Adjustment request not found");
    assertPendingRequest(request.status);
    assertRequesterOwnsCancellation(request.requestedById, actor.id);

    return this.repository.markCancelled(id);
  }
}
