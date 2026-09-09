// INV-01A/INV-02 — pure logic extracted from InventoryService's
// dispatchRequest()/receiveRequest(), so the core decisions on each side of
// an HQ->franchise stock transfer (how much moves, whether the request is
// in the right state to move) are testable without a live database.
import { ValidationError } from '../../../shared/errors/ValidationError.js';

export interface DispatchableRequest {
  status: string;
  quantityApproved: number | null;
  quantityRequested: number;
}

export interface HqItemLike {
  name: string;
  stock: number;
}

export function assertDispatchableStatus(status: string): void {
  if (status !== 'Approved' && status !== 'Partially Approved') {
    throw new ValidationError(`Request must be Approved or Partially Approved to dispatch (current status: "${status}").`);
  }
}

// INV-02 — receipt is only reachable after dispatch, so HQ stock is
// guaranteed to already be decremented before a franchise can add the
// corresponding stock on their side. Previously "Approved"/"Partially
// Approved" were also accepted directly by receiveRequest, which let a
// franchise self-report receipt (and inflate their own stock) without HQ
// ever dispatching — the same phantom-stock failure mode the dispatch-side
// fix closed, reopened from the other end of the same workflow.
export function assertReceivableStatus(status: string): void {
  if (status !== 'Dispatched') {
    throw new ValidationError(`Request must be Dispatched by Headquarters before receipt can be confirmed (current status: "${status}").`);
  }
}

// Shared by both sides of the same transfer — dispatchRequest (how much to
// remove from HQ) and receiveRequest (how much to add at the franchise) —
// so the two can never independently drift on what quantity actually moved.
export function resolveFulfillQuantity(request: DispatchableRequest): number {
  return request.quantityApproved !== null ? request.quantityApproved : request.quantityRequested;
}

// Fails closed — mirrors consumeItem's pre-existing insufficient-stock
// guard, not a new policy invented for this fix.
export function assertSufficientHqStock(hqItem: HqItemLike | null, itemName: string, qty: number): asserts hqItem is HqItemLike {
  if (!hqItem) {
    throw new ValidationError(`No corresponding HQ inventory item named "${itemName}" was found — cannot dispatch stock that doesn't exist at HQ.`);
  }
  if (hqItem.stock < qty) {
    throw new ValidationError(`Insufficient HQ stock for ${hqItem.name}. Available: ${hqItem.stock}, Required: ${qty}.`);
  }
}
