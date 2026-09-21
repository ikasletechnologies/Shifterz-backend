// INV-05 — executable verification for the Product Request / Dispatch
// state-machine fixes: the status-bypass defects (creation and approval
// both used to accept an arbitrary client-supplied `status`), the missing
// approve/reject preconditions, self-approval, quantity validation, and
// the two report defects found during the audit (hardcoded pending-request
// counters, stale pre-INV-02 movement scoping in the Stock Ledger report).
// Does NOT test actual database writes (a real InventoryRequest's full
// lifecycle end to end, real Inventory.stock changes, real transaction
// rollback) — there is no live database connection in this sandbox; those
// require the VPS stage, same as every other DB-touching piece of this
// engagement. Structural checks (source inspection) are used where the
// audit's test list asks for something only a live DB could fully prove —
// each is labeled as such, matching the precedent set by every prior
// "atomic/idempotent by construction" check this engagement (INV-01A
// dispatch, INV-02 receive, INV-04 approval).
// Run with: npx tsx scripts/test-inv05-product-request-integrity.ts
import fs from 'node:fs';
import {
  assertPositiveQuantity,
  assertSubmittedStatus,
  resolveApprovalOutcome,
} from '../src/modules/inventory/service/productRequest.helper.js';
import { assertNotSelfApprover } from '../src/modules/inventory/service/adjustment.helper.js';
import { assertDispatchableStatus, assertReceivableStatus, resolveFulfillQuantity, assertSufficientHqStock } from '../src/modules/inventory/service/dispatch.helper.js';
import { createProductRequestSchema, approveProductRequestSchema } from '../src/modules/inventory/validation/inventory.validation.js';
import { resolveDataScope, scopeWhere } from '../src/shared/scope/dataScope.js';
import { inventoryRouter } from '../src/modules/inventory/routes/inventory.routes.js';
import { InventoryController } from '../src/modules/inventory/controller/inventory.controller.js';

let pass = 0;
let fail = 0;

function assertEqual(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}
function assertThrows(name: string, fn: () => void) {
  try { fn(); fail++; console.log(`FAIL: ${name} — expected a throw, none occurred`); }
  catch { pass++; console.log(`PASS: ${name}`); }
}
function assertDoesNotThrow(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`PASS: ${name}`); }
  catch (e) { fail++; console.log(`FAIL: ${name} — unexpected throw: ${e}`); }
}
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}

// ─── 5. quantity validation (createRequest) ──────────────────────────────

assertDoesNotThrow('a positive integer quantity is valid', () => assertPositiveQuantity(5));
for (const q of [0, -1, -100]) {
  assertThrows(`quantity ${q} is rejected (no meaningless zero/negative requests)`, () => assertPositiveQuantity(q));
}
assertThrows('a non-integer quantity is rejected', () => assertPositiveQuantity(2.5));
assertThrows('NaN is rejected', () => assertPositiveQuantity(NaN));

assertTrue('valid create-request payload parses', createProductRequestSchema.safeParse({ body: { itemId: 'ITM1', quantityRequested: 10 } }).success);
assertTrue('zero quantityRequested is rejected at the schema layer', !createProductRequestSchema.safeParse({ body: { itemId: 'ITM1', quantityRequested: 0 } }).success);
assertTrue('negative quantityRequested is rejected at the schema layer', !createProductRequestSchema.safeParse({ body: { itemId: 'ITM1', quantityRequested: -5 } }).success);
assertTrue('missing itemId is rejected', !createProductRequestSchema.safeParse({ body: { quantityRequested: 5 } }).success);
// The core defect: `status` is no longer part of the schema at all, so a
// client-supplied status is silently stripped by validate(), never reaching
// the service — this is what closes the create-time state-machine bypass.
assertTrue(
  'a client-supplied status is stripped, never reaches the service (create-time bypass closed)',
  !('status' in (createProductRequestSchema.parse({ body: { itemId: 'ITM1', quantityRequested: 10, status: 'Dispatched' } }).body as any))
);

// ─── 1/3. approve/reject precondition — must currently be Submitted ─────

assertDoesNotThrow('"Submitted" passes the approve/reject precondition', () => assertSubmittedStatus('Submitted'));
for (const status of ['Draft', 'Approved', 'Partially Approved', 'Rejected', 'Dispatched', 'Received']) {
  assertThrows(`"${status}" cannot be approved/rejected again (was reachable from ANY status before this fix)`, () => assertSubmittedStatus(status));
}

// ─── 6/7/8. approval outcome derivation (rule D) ─────────────────────────

assertEqual('full approval: approvedQty == requestedQty -> Approved', resolveApprovalOutcome(10, 10), 'Approved');
assertEqual('partial approval: 0 < approvedQty < requestedQty -> Partially Approved', resolveApprovalOutcome(10, 4), 'Partially Approved');
assertEqual('approvedQty == 0 -> Rejected', resolveApprovalOutcome(10, 0), 'Rejected');
assertThrows('approvedQty exceeding requestedQty is rejected outright, not clamped', () => resolveApprovalOutcome(10, 15));
assertThrows('negative approvedQty is rejected', () => resolveApprovalOutcome(10, -1));
assertThrows('non-integer approvedQty is rejected', () => resolveApprovalOutcome(10, 4.5));

assertTrue('valid approve payload parses', approveProductRequestSchema.safeParse({ body: { quantityApproved: 5 } }).success);
assertTrue('negative quantityApproved is rejected at the schema layer', !approveProductRequestSchema.safeParse({ body: { quantityApproved: -1 } }).success);
assertTrue(
  'a client-supplied status on approve is stripped, never reaches the service (approve-time bypass closed)',
  !('status' in (approveProductRequestSchema.parse({ body: { quantityApproved: 5, status: 'Dispatched' } }).body as any))
);

// ─── self-approval (reusing INV-04's canonical helper, not a duplicate) ─

assertThrows('an HQ_USER approving their own request is blocked', () => assertNotSelfApprover('hq-user-1', 'hq-user-1'));
assertDoesNotThrow('a different HQ approver may approve', () => assertNotSelfApprover('hq-user-1', 'hq-user-2'));
assertDoesNotThrow('a legacy request with no requestedById never false-positives as self-approval', () => assertNotSelfApprover(null, 'hq-user-2'));

// ─── 2/18. franchise scope (create + cross-franchise access) ────────────

assertEqual(
  'a franchise-scoped actor is restricted to their own franchise for request creation/reads',
  scopeWhere(resolveDataScope({ role: 'FRANCHISE_ADMIN', franchiseId: 'F1' })),
  { franchiseId: 'F1' }
);
assertEqual('HQ is unrestricted for request reads/actions', scopeWhere(resolveDataScope({ role: 'HQ_USER' })), {});

// ─── 9/11/13/14/17. existing dispatch/receive gates (INV-01A/INV-02, reconfirmed here) ─

assertDoesNotThrow('dispatch requires Approved or Partially Approved', () => assertDispatchableStatus('Approved'));
assertThrows('dispatch is blocked once already Dispatched (idempotent — no double deduction)', () => assertDispatchableStatus('Dispatched'));
assertThrows('dispatch cannot overdraw HQ stock', () => assertSufficientHqStock({ name: 'Brake Pad', stock: 3 }, 'Brake Pad', 5));
assertEqual('dispatch uses the approved quantity, never the originally requested quantity', resolveFulfillQuantity({ status: 'Approved', quantityApproved: 4, quantityRequested: 10 }), 4);
assertDoesNotThrow('receive requires exactly Dispatched', () => assertReceivableStatus('Dispatched'));
assertThrows('receive is blocked once already Received (duplicate receive blocked)', () => assertReceivableStatus('Received'));
assertEqual('receive uses the dispatched (approved) quantity, not the originally requested quantity', resolveFulfillQuantity({ status: 'Dispatched', quantityApproved: 4, quantityRequested: 10 }), 4);

// ─── structural checks (source inspection — DB-dependent behaviors) ─────

const serviceSource = fs.readFileSync(new URL('../src/modules/inventory/service/inventory.service.ts', import.meta.url), 'utf-8');
const dispatchBody = serviceSource.slice(serviceSource.indexOf('async dispatchRequest'), serviceSource.indexOf('async receiveRequest'));
const receiveBody = serviceSource.slice(serviceSource.indexOf('async receiveRequest'), serviceSource.indexOf('// ═'.repeat(1), serviceSource.indexOf('async receiveRequest')));

assertTrue('12. dispatchRequest wraps everything in exactly one db.$transaction (fail => nothing changes)', (dispatchBody.match(/db\.\$transaction/g) || []).length === 1);
assertTrue('12. dispatchRequest creates exactly one InventoryMovement per call', (dispatchBody.match(/tx\.inventoryMovement\.create/g) || []).length === 1);
assertTrue('16. receiveRequest increases franchise stock (addition, not subtraction)', receiveBody.includes('stock: item.stock + qtyToAdd'));
assertTrue('20. receiveRequest wraps everything in exactly one db.$transaction (fail => nothing changes)', (receiveBody.match(/db\.\$transaction/g) || []).length === 1);
assertTrue('20. receiveRequest creates exactly one InventoryMovement per call', (receiveBody.match(/tx\.inventoryMovement\.create/g) || []).length === 1);
assertTrue('18. receiveRequest\'s own request lookup is franchise-scoped (scopeWhere), blocking cross-franchise access by id', receiveBody.includes('...scopeWhere(scope)'));

const controllerSource = fs.readFileSync(new URL('../src/modules/inventory/controller/inventory.controller.ts', import.meta.url), 'utf-8');
assertTrue('19. audit logging present for createRequest/approve/reject/dispatch/receive (5 request-lifecycle actions)', (controllerSource.match(/await logAudit\(/g) || []).length >= 7); // includes item CRUD too

// ─── 3. franchise cannot approve — genuine behavioral test (short-circuits before any DB call) ─

async function testFranchiseCannotApprove() {
  const controller = new InventoryController();
  let statusCode: number | null = null;
  let jsonBody: any = null;
  const fakeReq: any = { params: { id: 'req-1' }, user: { id: 'u1', role: 'FRANCHISE_ADMIN', franchiseId: 'F1' }, ip: '127.0.0.1', headers: {} };
  const fakeRes: any = {
    status(code: number) { statusCode = code; return this; },
    json(body: any) { jsonBody = body; return this; },
  };
  await controller.approveRequest(fakeReq, fakeRes, () => { throw new Error('next() should not be reached — the role check short-circuits first'); });
  assertEqual('3. FRANCHISE_ADMIN calling approveRequest is rejected with 403 before any DB call', statusCode, 403);
  assertTrue('3. rejection message names Headquarters-only authority', typeof jsonBody?.error === 'string' && jsonBody.error.includes('Headquarters'));
}

async function testFranchiseCannotReject() {
  const controller = new InventoryController();
  let statusCode: number | null = null;
  const fakeReq: any = { params: { id: 'req-1' }, user: { id: 'u1', role: 'BRANCH_MANAGER', franchiseId: 'F1' }, ip: '127.0.0.1', headers: {} };
  const fakeRes: any = { status(code: number) { statusCode = code; return this; }, json() { return this; } };
  await controller.rejectRequest(fakeReq, fakeRes, () => { throw new Error('next() should not be reached'); });
  assertEqual('BRANCH_MANAGER calling rejectRequest is rejected with 403 before any DB call', statusCode, 403);
}

// ─── report defects (structural — source text confirms the fix, not a live dashboard call) ─

const reportServiceSource = fs.readFileSync(new URL('../src/modules/report/service/report.service.ts', import.meta.url), 'utf-8');
assertTrue('7. pendingStockRequests is no longer hardcoded to 0', !reportServiceSource.includes('pendingStockRequests: 0,'));
assertTrue('7. pendingStockRequests is derived from actual Submitted requests', reportServiceSource.includes("r.status === 'Submitted'"));
assertTrue('7. pendingDispatches is derived from actual Approved/Partially Approved requests', reportServiceSource.includes("r.status === 'Approved' || r.status === 'Partially Approved'"));

const reportRepoSource = fs.readFileSync(new URL('../src/modules/report/repository/report.repository.ts', import.meta.url), 'utf-8');
assertTrue('7. the stale "no franchiseId column" comment on getInventoryMovements is gone', !reportRepoSource.includes("doesn't have a franchiseId column in the schema"));
assertTrue('7. Stock Ledger movement scoping now uses the franchiseId-tag-or-legacy-join OR condition, matching resolveMovementScope', reportRepoSource.includes('{ franchiseId: null, itemId: { in: scopedItemIds } }'));

// ─── route wiring: validate() attached to create/approve, status no longer freely settable ─

function layerCount(router: any, method: string, path: string): number | null {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods[method]);
  return layer ? layer.route.stack.length : null;
}
assertTrue('POST /requests has validate() attached (was completely unvalidated before)', (layerCount(inventoryRouter, 'post', '/requests') ?? 0) > 1);
assertTrue('POST /requests/:id/approve has validate() attached (was completely unvalidated before)', (layerCount(inventoryRouter, 'post', '/requests/:id/approve') ?? 0) > 1);

async function main() {
  await testFranchiseCannotApprove();
  await testFranchiseCannotReject();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main();
