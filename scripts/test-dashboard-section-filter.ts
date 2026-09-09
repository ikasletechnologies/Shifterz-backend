// D-21 — executable verification for allowedDashboardSections(), the pure
// role -> section mapping the dashboard route filters its response through.
// Run with: npx tsx scripts/test-dashboard-section-filter.ts
import { allowedDashboardSections } from '../src/routes/dashboard.js';

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

function sorted(arr: string[]): string[] {
  return [...arr].sort();
}

// Executive tier gets every section, including financial (revenue) — per
// D-21's explicit text authorizing revenue/collection summaries for these roles.
for (const role of ['SUPER_ADMIN', 'HQ_USER', 'FRANCHISE_ADMIN', 'BRANCH_MANAGER']) {
  assertEqual(`${role} -> full dashboard (all 5 sections)`, sorted(allowedDashboardSections(role)), sorted(['crm', 'workshop', 'financial', 'hr', 'inventory']));
}

// Reception-facing roles: customer/workshop status, no financial/hr/inventory.
for (const role of ['RECEPTION_EXECUTIVE', 'SERVICE_ADVISOR']) {
  assertEqual(`${role} -> crm + workshop only`, sorted(allowedDashboardSections(role)), sorted(['crm', 'workshop']));
}

// TECHNICIAN and QUALITY_INSPECTOR: workshop only.
for (const role of ['TECHNICIAN', 'QUALITY_INSPECTOR']) {
  assertEqual(`${role} -> workshop only`, allowedDashboardSections(role), ['workshop']);
}

assertEqual('BILLING_EXECUTIVE -> financial only', allowedDashboardSections('BILLING_EXECUTIVE'), ['financial']);
assertEqual('INVENTORY_EXECUTIVE -> inventory only', allowedDashboardSections('INVENTORY_EXECUTIVE'), ['inventory']);

// No revenue/financial leakage to any non-executive, non-billing role.
for (const role of ['RECEPTION_EXECUTIVE', 'SERVICE_ADVISOR', 'TECHNICIAN', 'QUALITY_INSPECTOR', 'INVENTORY_EXECUTIVE']) {
  assertEqual(`${role} -> financial section never included`, allowedDashboardSections(role).includes('financial'), false);
}

// Unknown/unlisted role -> no sections at all (fail closed, not a silent full-access default).
assertEqual('unrecognized role -> empty', allowedDashboardSections('SOME_FUTURE_ROLE'), []);
assertEqual('no role at all -> empty', allowedDashboardSections(undefined), []);
assertEqual('empty string role -> empty', allowedDashboardSections(''), []);

// Role strings carrying a "|"-suffixed variant (seen elsewhere in this
// codebase, e.g. resolveActionPermissionsPure) still resolve on the base role.
assertEqual('role with "|" suffix still resolves', sorted(allowedDashboardSections('FRANCHISE_ADMIN|something')), sorted(['crm', 'workshop', 'financial', 'hr', 'inventory']));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
