// INV-02 — executable verification for the ledger-remediation pure logic:
// the receivability status gate (closes the dispatch-bypass gap), the
// shared fulfill-quantity resolver now used by both dispatchRequest and
// receiveRequest, and resolveMovementScope's franchiseId-tag-or-legacy-join
// behavior. Does NOT test actual database writes (a real InventoryMovement
// row actually carrying franchiseId, actual atomic-transaction rollback,
// the real HQ purchase-receipt loop) — there is no live database
// connection in this sandbox; those require the VPS stage, same as every
// other DB-touching piece of this engagement.
// Run with: npx tsx scripts/test-inv02-ledger-remediation.ts
import { assertReceivableStatus, resolveFulfillQuantity } from '../src/modules/inventory/service/dispatch.helper.js';
import { resolveMovementScope } from '../src/modules/inventory/service/movementScope.helper.js';

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

// ─── Step 1/2 — receiveRequest gated on "Dispatched" only ───────────────

assertDoesNotThrow('"Dispatched" is receivable', () => assertReceivableStatus('Dispatched'));
for (const status of ['Approved', 'Partially Approved', 'Submitted', 'Pending', 'Rejected', 'Received']) {
  assertThrows(`"${status}" is no longer receivable directly (dispatch-bypass gap closed)`, () => assertReceivableStatus(status));
}

// ─── Step 1 — quantity resolver shared by dispatch and receive ──────────

assertEqual(
  'full approval: fulfill quantity equals quantityApproved',
  resolveFulfillQuantity({ status: 'Dispatched', quantityApproved: 5, quantityRequested: 10 }),
  5
);
assertEqual(
  'partial approval: fulfill quantity is the approved amount, not the originally requested amount',
  resolveFulfillQuantity({ status: 'Dispatched', quantityApproved: 3, quantityRequested: 10 }),
  3
);
assertEqual(
  'no explicit approval recorded: falls back to quantityRequested',
  resolveFulfillQuantity({ status: 'Dispatched', quantityApproved: null, quantityRequested: 10 }),
  10
);

// ─── Step 6 — movement scope with franchiseId tagging ───────────────────

// Unrestricted roles: unaffected by the franchiseId column's introduction.
assertEqual(
  'SUPER_ADMIN unaffected by franchiseId tagging',
  resolveMovementScope('SUPER_ADMIN', null, undefined, []),
  { empty: false, where: {} }
);
assertEqual(
  'HQ_USER unaffected by franchiseId tagging',
  resolveMovementScope('HQ_USER', 'F1', 'item-9', []),
  { empty: false, where: { itemId: 'item-9' } }
);

// Franchise-scoped, no itemId filter: sees rows explicitly tagged as
// theirs OR legacy (pre-migration) untagged rows whose item currently
// belongs to them.
assertEqual(
  'franchise-scoped, no itemId: OR of (tagged as mine) and (legacy null-tag row on my own item)',
  resolveMovementScope('FRANCHISE_ADMIN', 'F1', undefined, ['item-1', 'item-2']),
  { empty: false, where: { OR: [{ franchiseId: 'F1' }, { franchiseId: null, itemId: { in: ['item-1', 'item-2'] } }] } }
);

// Franchise-scoped, itemId is one of their own current items: same OR
// condition, narrowed to that item — matches either a directly-tagged row
// or a legacy untagged row on that item.
assertEqual(
  'franchise-scoped, itemId is one of their own items: narrowed OR condition',
  resolveMovementScope('FRANCHISE_ADMIN', 'F1', 'item-1', ['item-1', 'item-2']),
  { empty: false, where: { itemId: 'item-1', OR: [{ franchiseId: 'F1' }, { franchiseId: null, itemId: { in: ['item-1', 'item-2'] } }] } }
);

// The key INV-02 behavior change from INV-01A: a franchise-scoped actor
// asking about an itemId that is NOT one of their own current items (e.g.
// the shared HQ item a DISPATCH movement was written against) is no longer
// short-circuited to empty:true. The where-clause is still safe — it can
// only ever match a row explicitly tagged with this actor's own
// franchiseId (a DISPATCH destined for them) — but it is no longer
// unreachable purely because the itemId belongs to a different Inventory
// row. This is what makes a DISPATCH against the HQ item visible to the
// receiving franchise (audit-completeness gap identified in the INV-02
// report, §5.2/§7).
assertEqual(
  "franchise-scoped, itemId belongs to a different Inventory row (e.g. the HQ item a DISPATCH was written against): only matches rows explicitly tagged to this franchise, never leaks another franchise's movements",
  resolveMovementScope('FRANCHISE_ADMIN', 'F1', 'hq-item-shared-name', ['item-1', 'item-2']),
  { empty: false, where: { itemId: 'hq-item-shared-name', OR: [{ franchiseId: 'F1' }, { franchiseId: null, itemId: { in: ['item-1', 'item-2'] } }] } }
);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
