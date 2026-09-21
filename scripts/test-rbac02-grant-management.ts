// RBAC-02 — executable verification for the grant-management foundation:
// action/role validation (pure), SUPER_ADMIN-only authority check (pure),
// and a behavioral check that PUT /api/hq/role-permissions/:role/actions'
// own route-level middleware rejects HQ_USER specifically (not just "some
// role check exists" — the whole point of this phase is that this one
// endpoint is stricter than the router's default SUPER_ADMIN/HQ_USER gate).
// Does NOT test actual database writes (RolePermission.actions persistence,
// audit rows, transaction rollback against a real failure) — there is no
// live database connection in this sandbox; those require the VPS stage.
// Run with: npx tsx scripts/test-rbac02-grant-management.ts
import { isValidAction, isKnownRole, ACTION_CATALOG } from '../src/shared/rbac/actionCatalog.js';
import { normalizeAndValidateActions, assertGrantManagerAuthority } from '../src/shared/rbac/roleActionGrant.service.js';
import { hqRouter } from '../src/routes/hq.js';

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

// ─── Action validation ────────────────────────────────────────────────

assertEqual('a real catalog action is valid', isValidAction('jobs:assign'), true);
assertEqual('an unknown string is not a valid action', isValidAction('not:a:real:action'), false);
assertEqual('a deferred/not-yet-finalized action (attendance:self:checkin) is correctly excluded from the catalog', isValidAction('attendance:self:checkin'), false);
assertEqual('every catalog entry is non-empty and resource:verb-shaped', ACTION_CATALOG.every((a) => /^[a-z0-9-]+(:[a-z0-9-]+)+$/.test(a)), true);

assertDoesNotThrow('normalizeAndValidateActions accepts a list of valid actions', () => {
  normalizeAndValidateActions(['jobs:assign', 'outpass:approve']);
});

assertThrows('normalizeAndValidateActions rejects an unknown action', () => {
  normalizeAndValidateActions(['jobs:assign', 'not:a:real:action']);
});

{
  const result = normalizeAndValidateActions(['jobs:assign', 'jobs:assign', 'outpass:approve']);
  assertEqual('duplicate actions are normalized (deduped), not rejected', result.sort(), ['jobs:assign', 'outpass:approve'].sort());
}

assertDoesNotThrow('an explicit empty action list is valid (revoke everything)', () => {
  normalizeAndValidateActions([]);
});

// ─── Role validation ─────────────────────────────────────────────────

assertEqual('a known role is recognized', isKnownRole('FRANCHISE_ADMIN'), true);
assertEqual('an unknown role string is rejected', isKnownRole('NOT_A_REAL_ROLE'), false);

// ─── Authority: SUPER_ADMIN only ────────────────────────────────────────

assertDoesNotThrow('SUPER_ADMIN may manage grants', () => assertGrantManagerAuthority({ role: 'SUPER_ADMIN' }));

for (const role of ['HQ_USER', 'FRANCHISE_ADMIN', 'BRANCH_MANAGER', 'BILLING_EXECUTIVE', 'INVENTORY_EXECUTIVE', 'RECEPTION_EXECUTIVE', 'SERVICE_ADVISOR', 'TECHNICIAN', 'QUALITY_INSPECTOR']) {
  assertThrows(`${role} cannot manage grants (SUPER_ADMIN only, deliberately stricter than the usual SUPER_ADMIN/HQ_USER tier)`, () => assertGrantManagerAuthority({ role }));
}
assertThrows('no actor at all -> denied', () => assertGrantManagerAuthority(undefined));

// ─── Route-level behavioral check ────────────────────────────────────────
// PUT /role-permissions/:role/actions must reject HQ_USER at its OWN
// middleware layer, not merely inherit the router's default SUPER_ADMIN/
// HQ_USER gate — that's the entire point of this endpoint being stricter.
// This calls the actual registered middleware function, not a copy of it.

function fakeRes() {
  const res: any = {
    statusCode: undefined as number | undefined,
    status(code: number) { res.statusCode = code; return res; },
    json(_body: unknown) { return res; },
  };
  return res;
}

{
  const layer = (hqRouter as any).stack.find(
    (l: any) => l.route && l.route.path === '/role-permissions/:role/actions' && l.route.methods.put
  );
  if (!layer) {
    fail++;
    console.log('FAIL: PUT /role-permissions/:role/actions route is registered');
  } else {
    pass++;
    console.log('PASS: PUT /role-permissions/:role/actions route is registered');

    assertEqual('the route has its own middleware layer beyond the handler (role-gated at the route level, not just the router default)', layer.route.stack.length > 1, true);

    const roleCheckMiddleware = layer.route.stack[0].handle;
    const hqUserReq: any = { user: { role: 'HQ_USER' } };
    const hqUserRes = fakeRes();
    let hqUserNextCalled = false;
    roleCheckMiddleware(hqUserReq, hqUserRes, () => { hqUserNextCalled = true; });
    assertEqual('HQ_USER is rejected by this route\'s own middleware (403), not just relying on router-level gating', { called: hqUserNextCalled, status: hqUserRes.statusCode }, { called: false, status: 403 });

    const superAdminReq: any = { user: { role: 'SUPER_ADMIN' } };
    const superAdminRes = fakeRes();
    let superAdminNextCalled = false;
    roleCheckMiddleware(superAdminReq, superAdminRes, () => { superAdminNextCalled = true; });
    assertEqual('SUPER_ADMIN passes this route\'s own middleware', { called: superAdminNextCalled, status: superAdminRes.statusCode }, { called: true, status: undefined });
  }
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
