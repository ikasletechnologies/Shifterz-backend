// Pre-flight Patch C — executable verification for resolveActionPermissionsPure().
// Pure function, zero DB dependency, so this actually runs and proves
// something, unlike the DB-dependent exploit checks blocked by sandbox
// connectivity. Run with: npx tsx scripts/test-action-permission-resolver.ts
import { resolveActionPermissionsPure, ALL_ACTIONS } from '../src/lib/auth.js';

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

// State 1: no employee override (actionsOverride=false) -> inherit RolePermission.actions
assertEqual(
  'no override -> inherits role actions',
  resolveActionPermissionsPure({
    role: 'TECHNICIAN',
    userPermission: { actions: ['ignored:should_not_appear'], actionsOverride: false },
    rolePermission: { actions: ['jobs:view', 'jobs:edit'] },
  }),
  ['jobs:view', 'jobs:edit']
);

// State 2: explicit override with zero actions -> deny everything, role actions ignored
assertEqual(
  'explicit override with [] -> zero actions, role ignored',
  resolveActionPermissionsPure({
    role: 'TECHNICIAN',
    userPermission: { actions: [], actionsOverride: true },
    rolePermission: { actions: ['jobs:view', 'jobs:edit'] },
  }),
  []
);

// State 3: explicit override with specific grants -> employee-specific list used verbatim
assertEqual(
  'explicit override with grants -> employee-specific list',
  resolveActionPermissionsPure({
    role: 'TECHNICIAN',
    userPermission: { actions: ['billing:view'], actionsOverride: true },
    rolePermission: { actions: ['jobs:view', 'jobs:edit'] },
  }),
  ['billing:view']
);

// SUPER_ADMIN bypass, regardless of any override/role data present
assertEqual(
  'SUPER_ADMIN -> ALL_ACTIONS sentinel, ignores everything else',
  resolveActionPermissionsPure({
    role: 'SUPER_ADMIN',
    userPermission: { actions: [], actionsOverride: true },
    rolePermission: { actions: [] },
  }),
  [ALL_ACTIONS]
);

// No RolePermission row exists yet for the role (pre-backfill state) -> fail closed, not open
assertEqual(
  'no RolePermission row -> fail closed to []',
  resolveActionPermissionsPure({
    role: 'BRAND_NEW_ROLE_NOT_YET_SEEDED',
    userPermission: null,
    rolePermission: null,
  }),
  []
);

// No UserPermission row at all (typical case pre-migration-backfill for most employees)
assertEqual(
  'no UserPermission row -> falls through to RolePermission',
  resolveActionPermissionsPure({
    role: 'FRANCHISE_ADMIN',
    userPermission: null,
    rolePermission: { actions: ['employees:view', 'employees:create'] },
  }),
  ['employees:view', 'employees:create']
);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
