// INV-05 — pure logic extracted from InventoryService's createRequest/
// approveRequest/rejectRequest, closing the state-machine bypass this
// audit found: both of those previously accepted an arbitrary
// client-supplied `status` string with no validation at all, letting a
// caller create a request already "Dispatched"/"Received" (self-service
// stock inflation with zero HQ involvement) or force-approve a request
// with a negative or over-requested quantityApproved.
import { ValidationError } from '../../../shared/errors/ValidationError.js';

export function assertPositiveQuantity(quantity: number, label: string = 'quantityRequested'): void {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
    throw new ValidationError(`${label} must be a positive whole number.`);
  }
}

// Only a request currently awaiting HQ review may be approved or rejected.
// Closes the gap where approve/reject had no precondition at all and could
// be called on an already-Rejected/Dispatched/Received request.
export function assertSubmittedStatus(status: string): void {
  if (status !== 'Submitted') {
    throw new ValidationError(`This request is "${status}", not Submitted — it cannot be approved or rejected again.`);
  }
}

export type ApprovalOutcome = 'Approved' | 'Partially Approved' | 'Rejected';

// Locked decision (rule D): the status is DERIVED from the approved
// quantity, never accepted as a client-supplied value. approvedQty must be
// within [0, requestedQty] — anything outside that range is rejected
// outright rather than silently clamped, so a caller never gets a
// different outcome than the one they asked for.
export function resolveApprovalOutcome(requestedQty: number, approvedQty: number): ApprovalOutcome {
  if (!Number.isFinite(approvedQty) || !Number.isInteger(approvedQty)) {
    throw new ValidationError('quantityApproved must be a whole number.');
  }
  if (approvedQty < 0) {
    throw new ValidationError('quantityApproved cannot be negative.');
  }
  if (approvedQty > requestedQty) {
    throw new ValidationError(`quantityApproved (${approvedQty}) cannot exceed the requested quantity (${requestedQty}).`);
  }
  if (approvedQty === 0) return 'Rejected';
  if (approvedQty === requestedQty) return 'Approved';
  return 'Partially Approved';
}
