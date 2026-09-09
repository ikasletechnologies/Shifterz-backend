// INV-04 — executable verification for the stock-adjustment approval
// workflow's pure logic (adjustment.helper.ts), validation schemas, and
// route wiring. Does NOT test actual database writes (a real
// InventoryAdjustmentRequest row's full lifecycle, a real Inventory.stock
// change, real transaction rollback behavior) — there is no live database
// connection in this sandbox; those require the VPS stage, same as every
// other DB-touching piece of this engagement. "Atomic approval behavior"
// is verified structurally below (the approval path is a single
// db.$transaction wrapping every step, confirmed by source inspection),
// not behaviorally — the same limitation applies to every other
// transaction-wrapped inventory operation (dispatchRequest, receiveRequest,
// consumeItem) throughout this engagement; none of those have ever been
// behaviorally tested for rollback either.
// Run with: npx tsx scripts/test-inv04-adjustment-approval.ts
import fs from 'node:fs';
import {
  assertApproverAuthority,
  assertPendingRequest,
  assertNotSelfApprover,
  assertRequesterOwnsCancellation,
  assertAdjustmentWithinStock,
  resolveNewStock,
  buildAdjustmentMovementData,
} from '../src/modules/inventory/service/adjustment.helper.js';
import { createAdjustmentSchema, rejectAdjustmentSchema } from '../src/modules/inventory/validation/inventoryAdjustment.validation.js';
import { resolveDataScope, scopeWhere } from '../src/shared/scope/dataScope.js';
import { inventoryRouter } from '../src/modules/inventory/routes/inventory.routes.js';

let pass = 0;
let fail = 0;

function assertEqual(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.log(`FAIL: ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(name: string, fn: () => void) {
  try {
    fn();
    fail++;
    console.log(`FAIL: ${name} — expected a throw, none occurred`);
  } catch {
    pass++;
    console.log(`PASS: ${name}`);
  }
}

function assertDoesNotThrow(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`PASS: ${name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL: ${name} — unexpected throw: ${e}`);
  }
}

function assertTrue(name: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.log(`FAIL: ${name}`);
  }
}

// ─── create pending request / mandatory reason ───────────────────────────

assertTrue(
  'valid create payload (positive qty, reason present) parses',
  createAdjustmentSchema.safeParse({ body: { itemId: 'ITM1', requestedQty: 5, reason: 'Cycle count correction' } }).success
);
assertTrue(
  'valid create payload (negative qty) parses',
  createAdjustmentSchema.safeParse({ body: { itemId: 'ITM1', requestedQty: -5, reason: 'Damaged stock write-off' } }).success
);
assertTrue(
  'missing reason is rejected (mandatory reason)',
  !createAdjustmentSchema.safeParse({ body: { itemId: 'ITM1', requestedQty: 5 } }).success
);
assertTrue(
  'empty-string reason is rejected (mandatory, non-empty)',
  !createAdjustmentSchema.safeParse({ body: { itemId: 'ITM1', requestedQty: 5, reason: '   ' } }).success
);
assertTrue(
  'zero requestedQty is rejected (a zero adjustment is meaningless)',
  !createAdjustmentSchema.safeParse({ body: { itemId: 'ITM1', requestedQty: 0, reason: 'x' } }).success
);
assertTrue(
  'missing itemId is rejected',
  !createAdjustmentSchema.safeParse({ body: { requestedQty: 5, reason: 'x' } }).success
);

// ─── rejection + required note ────────────────────────────────────────────

assertTrue('valid rejection note parses', rejectAdjustmentSchema.safeParse({ body: { rejectionNote: 'Count does not match physical audit' } }).success);
assertTrue('missing rejectionNote is rejected', !rejectAdjustmentSchema.safeParse({ body: {} }).success);
assertTrue('empty-string rejectionNote is rejected', !rejectAdjustmentSchema.safeParse({ body: { rejectionNote: '  ' } }).success);

// ─── positive / negative adjustment stock-floor validation ──────────────

assertDoesNotThrow('positive adjustment never threatens the stock floor', () => assertAdjustmentWithinStock(20, 5));
assertEqual('positive adjustment: new stock is current + requestedQty', resolveNewStock(20, 5), 25);

assertDoesNotThrow('negative adjustment within current stock passes', () => assertAdjustmentWithinStock(20, -15));
assertEqual('negative adjustment within bounds: new stock computed correctly', resolveNewStock(20, -15), 5);

// The exact scenario from the locked decision: requested against stock=20,
// but by approval time current stock has dropped to 8 (some other movement
// happened in between) — approval MUST re-validate against 8, not 20.
assertThrows(
  'negative adjustment exceeding CURRENT stock at approval time is rejected (8 - 15 = -7)',
  () => assertAdjustmentWithinStock(8, -15)
);
assertDoesNotThrow('negative adjustment exactly draining stock to zero is allowed', () => assertAdjustmentWithinStock(15, -15));
assertEqual('draining to exactly zero computes correctly', resolveNewStock(15, -15), 0);

// ─── approver authority (SUPER_ADMIN + HQ_USER only) ─────────────────────

assertDoesNotThrow('SUPER_ADMIN has approver authority', () => assertApproverAuthority('SUPER_ADMIN'));
assertDoesNotThrow('HQ_USER has approver authority', () => assertApproverAuthority('HQ_USER'));
for (const role of ['FRANCHISE_ADMIN', 'BRANCH_MANAGER', 'TECHNICIAN', undefined]) {
  assertThrows(`"${role}" does NOT have approver authority`, () => assertApproverAuthority(role));
}

// ─── self-approval rejection ─────────────────────────────────────────────

assertThrows('requester cannot approve/reject their own request', () => assertNotSelfApprover('user-1', 'user-1'));
assertDoesNotThrow('a different approver may approve/reject', () => assertNotSelfApprover('user-1', 'user-2'));
assertDoesNotThrow('unknown requester identity does not false-positive as self-approval', () => assertNotSelfApprover(null, 'user-2'));

// ─── requester cancellation vs. cancellation by another user ────────────

assertDoesNotThrow('the original requester may cancel', () => assertRequesterOwnsCancellation('user-1', 'user-1'));
assertThrows('a different user may NOT cancel someone else\'s request', () => assertRequesterOwnsCancellation('user-1', 'user-2'));
assertThrows('an unauthenticated actor may not cancel', () => assertRequesterOwnsCancellation('user-1', undefined));

// ─── terminal-state protection ───────────────────────────────────────────

assertDoesNotThrow('"Pending" passes the pending-state gate', () => assertPendingRequest('Pending'));
for (const status of ['Approved', 'Rejected', 'Cancelled']) {
  assertThrows(`"${status}" is terminal — cannot be transitioned again`, () => assertPendingRequest(status));
}

// ─── franchise isolation (reusing the canonical scope primitives) ───────

assertEqual(
  'SUPER_ADMIN scope is unrestricted for adjustment reads/approvals',
  scopeWhere(resolveDataScope({ role: 'SUPER_ADMIN' })),
  {}
);
assertEqual(
  'HQ_USER scope is unrestricted for adjustment reads/approvals',
  scopeWhere(resolveDataScope({ role: 'HQ_USER' })),
  {}
);
assertEqual(
  'FRANCHISE_ADMIN is restricted to their own franchise for adjustment reads/creation',
  scopeWhere(resolveDataScope({ role: 'FRANCHISE_ADMIN', franchiseId: 'F1' })),
  { franchiseId: 'F1' }
);

// ─── movement quantity/balance/franchise correctness ─────────────────────

assertEqual(
  'positive-approval movement: correct signed quantity, balance, ADJUST type, ADJ- reference',
  buildAdjustmentMovementData({ itemId: 'ITM1', requestId: 'REQ1', requestedQty: 5, newBalance: 25, performedBy: 'user-9', franchiseId: 'F1' }),
  { itemId: 'ITM1', type: 'ADJUST', reference: 'ADJ-REQ1', quantity: 5, balance: 25, performedBy: 'user-9', franchiseId: 'F1' }
);
assertEqual(
  'negative-approval movement: negative quantity preserved as-is (not made positive)',
  buildAdjustmentMovementData({ itemId: 'ITM1', requestId: 'REQ2', requestedQty: -15, newBalance: 5, performedBy: 'user-9', franchiseId: 'F1' }),
  { itemId: 'ITM1', type: 'ADJUST', reference: 'ADJ-REQ2', quantity: -15, balance: 5, performedBy: 'user-9', franchiseId: 'F1' }
);
assertEqual(
  'HQ-owned item movement carries franchiseId: null, not fabricated',
  buildAdjustmentMovementData({ itemId: 'ITM-HQ', requestId: 'REQ3', requestedQty: 10, newBalance: 110, performedBy: 'user-9', franchiseId: null }),
  { itemId: 'ITM-HQ', type: 'ADJUST', reference: 'ADJ-REQ3', quantity: 10, balance: 110, performedBy: 'user-9', franchiseId: null }
);

// ─── atomic approval behavior (structural check) ─────────────────────────

const serviceSource = fs.readFileSync(new URL('../src/modules/inventory/service/inventoryAdjustment.service.ts', import.meta.url), 'utf-8');
const approveBody = serviceSource.slice(serviceSource.indexOf('async approveRequest'), serviceSource.indexOf('async rejectRequest'));
assertTrue('approveRequest wraps its work in exactly one db.$transaction', (approveBody.match(/db\.\$transaction/g) || []).length === 1);
assertTrue('the stock floor is re-validated (assertAdjustmentWithinStock) inside the transaction, before the stock write', (() => {
  const floorIdx = approveBody.indexOf('assertAdjustmentWithinStock');
  const writeIdx = approveBody.indexOf('tx.inventory.update');
  return floorIdx !== -1 && writeIdx !== -1 && floorIdx < writeIdx;
})());
assertTrue('exactly one InventoryMovement is created per approval', (approveBody.match(/tx\.inventoryMovement\.create/g) || []).length === 1);
assertTrue('the request is marked Approved only after the movement is written', approveBody.indexOf('tx.inventoryMovement.create') < approveBody.indexOf('markApproved'));

// ─── route wiring (approve/reject role-gated; create/list/cancel are not, service enforces there) ──

function layerCount(router: any, method: string, path: string): number | null {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods[method]);
  return layer ? layer.route.stack.length : null;
}

assertTrue('POST /adjustments/:id/approve has requireRole attached (>1 layer)', (layerCount(inventoryRouter, 'post', '/adjustments/:id/approve') ?? 0) > 1);
assertTrue('POST /adjustments/:id/reject has requireRole + validate attached (>1 layer)', (layerCount(inventoryRouter, 'post', '/adjustments/:id/reject') ?? 0) > 1);
assertEqual('POST /adjustments (create) is not role-gated at the route (validate() only, 2 layers)', layerCount(inventoryRouter, 'post', '/adjustments'), 2);
assertEqual('POST /adjustments/:id/cancel is not role-gated at the route (requester-only check is in the service)', layerCount(inventoryRouter, 'post', '/adjustments/:id/cancel'), 1);
assertEqual('GET /adjustments is not role-gated at the route (franchise scope enforced in the service)', layerCount(inventoryRouter, 'get', '/adjustments'), 1);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
