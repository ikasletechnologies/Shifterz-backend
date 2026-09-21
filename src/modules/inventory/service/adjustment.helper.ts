// INV-04 — pure logic extracted from InventoryAdjustmentService, so the
// state-machine and stock-floor decisions are testable without a live
// database.
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError.js';

// Locked decision: same authority tier as the existing HQ-only inventory
// approvals (approveRequest/rejectRequest/dispatchRequest) — SUPER_ADMIN and
// HQ_USER only. FRANCHISE_ADMIN/BRANCH_MANAGER may request adjustments for
// their own franchise but never approve/reject them.
export const ADJUSTMENT_APPROVER_ROLES = ['SUPER_ADMIN', 'HQ_USER'];

export function assertApproverAuthority(role: string | undefined): void {
  if (!role || !ADJUSTMENT_APPROVER_ROLES.includes(role)) {
    throw new ForbiddenError("Only Headquarters may approve or reject a stock adjustment request.");
  }
}

export function assertPendingRequest(status: string): void {
  if (status !== 'Pending') {
    throw new ValidationError(`This adjustment request has already been ${status.toLowerCase()} and cannot be changed again.`);
  }
}

// Locked decision: the requester can never approve or reject their own
// request, regardless of role — mirrors D-15's already-locked self-approval
// prohibition for leave approval.
export function assertNotSelfApprover(requestedById: string | null | undefined, actorId: string | undefined): void {
  if (requestedById && actorId && requestedById === actorId) {
    throw new ForbiddenError("You cannot approve or reject your own adjustment request.");
  }
}

export function assertRequesterOwnsCancellation(requestedById: string | null | undefined, actorId: string | undefined): void {
  if (!actorId || requestedById !== actorId) {
    throw new ForbiddenError("Only the original requester may cancel this adjustment request.");
  }
}

// Locked decision: negative adjustments must be re-validated against the
// CURRENT stock at approval time, never the stock value that existed when
// the request was created — closes the same phantom-stock risk class as
// INV-01A/INV-02, applied here at the approval boundary.
export function assertAdjustmentWithinStock(currentStock: number, requestedQty: number): void {
  if (currentStock + requestedQty < 0) {
    throw new ValidationError(
      `This adjustment would take stock negative (current: ${currentStock}, requested: ${requestedQty}). Rejected — no stock change made.`
    );
  }
}

export function resolveNewStock(currentStock: number, requestedQty: number): number {
  return currentStock + requestedQty;
}

export interface AdjustmentMovementInput {
  itemId: string;
  requestId: string;
  requestedQty: number;
  newBalance: number;
  performedBy: string;
  franchiseId: string | null;
}

export interface AdjustmentMovementData {
  itemId: string;
  type: 'ADJUST';
  reference: string;
  quantity: number;
  balance: number;
  performedBy: string;
  franchiseId: string | null;
}

// Isolates the exact shape of the one InventoryMovement row an approval
// writes, so "quantity/balance/franchiseId are correct" is directly
// assertable without touching the database. Reuses the existing ADJUST
// type and REQ-style reference convention (dispatch/receive use `REQ-<id>`;
// this uses `ADJ-<id>` so adjustment movements are distinguishable from
// replenishment movements by reference alone).
export function buildAdjustmentMovementData(input: AdjustmentMovementInput): AdjustmentMovementData {
  return {
    itemId: input.itemId,
    type: 'ADJUST',
    reference: `ADJ-${input.requestId}`,
    quantity: input.requestedQty,
    balance: input.newBalance,
    performedBy: input.performedBy,
    franchiseId: input.franchiseId,
  };
}
