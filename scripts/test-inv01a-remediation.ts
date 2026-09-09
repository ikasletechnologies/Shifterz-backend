// INV-01A — executable verification for the two extracted pure-logic pieces
// behind this phase's real fixes: dispatch validation (the phantom-stock
// fix's core decisions) and movement-visibility scoping. Does NOT test
// actual database writes (a real HQ item's stock actually decrementing, a
// real InventoryMovement row appearing, actual franchise-scoped query
// results) — there is no live database connection in this sandbox; those
// require the VPS stage, same as every other DB-touching piece of this
// engagement.
// Run with: npx tsx scripts/test-inv01a-remediation.ts
import { assertDispatchableStatus, resolveFulfillQuantity, assertSufficientHqStock } from '../src/modules/inventory/service/dispatch.helper.js';
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

// ─── Phantom-stock fix — dispatch validation ────────────────────────────

assertDoesNotThrow('Approved status is dispatchable', () => assertDispatchableStatus('Approved'));
assertDoesNotThrow('Partially Approved status is dispatchable', () => assertDispatchableStatus('Partially Approved'));
for (const status of ['Submitted', 'Pending', 'Rejected', 'Dispatched', 'Received']) {
  assertThrows(`"${status}" status is not dispatchable`, () => assertDispatchableStatus(status));
}

assertEqual('quantityApproved takes precedence when set', resolveFulfillQuantity({ status: 'Approved', quantityApproved: 5, quantityRequested: 10 }), 5);
assertEqual('falls back to quantityRequested when quantityApproved is null', resolveFulfillQuantity({ status: 'Approved', quantityApproved: null, quantityRequested: 10 }), 10);
assertEqual('quantityApproved of 0 is respected (not treated as falsy/missing)', resolveFulfillQuantity({ status: 'Approved', quantityApproved: 0, quantityRequested: 10 }), 0);

assertThrows('no corresponding HQ item -> fails closed', () => assertSufficientHqStock(null, 'Brake Pad', 5));
assertThrows('HQ item exists but insufficient stock -> fails closed', () => assertSufficientHqStock({ name: 'Brake Pad', stock: 2 }, 'Brake Pad', 5));
assertDoesNotThrow('HQ item with exactly enough stock -> passes', () => assertSufficientHqStock({ name: 'Brake Pad', stock: 5 }, 'Brake Pad', 5));
assertDoesNotThrow('HQ item with more than enough stock -> passes', () => assertSufficientHqStock({ name: 'Brake Pad', stock: 20 }, 'Brake Pad', 5));

// ─── Movement-visibility scope fix ───────────────────────────────────────

assertEqual('SUPER_ADMIN sees everything, no itemId filter', resolveMovementScope('SUPER_ADMIN', null, undefined, []), { empty: false, where: {} });
assertEqual('HQ_USER sees everything regardless of franchiseId', resolveMovementScope('HQ_USER', 'F1', undefined, []), { empty: false, where: {} });
assertEqual('SUPER_ADMIN with an itemId filter still just filters by that id, no scope restriction', resolveMovementScope('SUPER_ADMIN', null, 'item-1', []), { empty: false, where: { itemId: 'item-1' } });

// NOTE: as of INV-02, resolveMovementScope's where-shape changed to an
// OR-based condition (explicit franchiseId tag OR legacy-null-row itemId
// join) — see test-inv02-ledger-remediation.ts for the full behavior.
// These three assertions are updated here only so this file keeps building;
// the underlying scoping decision they exercise is unchanged in spirit
// (franchise-scoped actors never see another franchise's movements).
assertEqual(
  'franchise-scoped role, no itemId filter -> restricted via the franchiseId-tag-or-legacy-join condition',
  resolveMovementScope('FRANCHISE_ADMIN', 'F1', undefined, ['item-1', 'item-2']),
  { empty: false, where: { OR: [{ franchiseId: 'F1' }, { franchiseId: null, itemId: { in: ['item-1', 'item-2'] } }] } }
);
assertEqual(
  'franchise-scoped role requesting their own item -> allowed',
  resolveMovementScope('FRANCHISE_ADMIN', 'F1', 'item-1', ['item-1', 'item-2']),
  { empty: false, where: { itemId: 'item-1', OR: [{ franchiseId: 'F1' }, { franchiseId: null, itemId: { in: ['item-1', 'item-2'] } }] } }
);
assertEqual(
  'franchise-scoped role with no franchiseId at all -> falls through unrestricted (matches existing getAllItems/getRequests convention for this edge case)',
  resolveMovementScope('FRANCHISE_ADMIN', undefined, undefined, []),
  { empty: false, where: {} }
);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
