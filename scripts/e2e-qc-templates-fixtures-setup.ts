// Phase 4B-2E — E2E test fixture setup for the QC Checklist Template
// Management frontend. Run once before the Playwright suite (frontend repo)
// via its globalSetup. Creates fully isolated, disposable test data — two
// dedicated test franchises, never the real HQ scope for anything that
// PUBLISHES (Part 41/42: publishing against the real global scope would
// permanently supersede the real bootstrapped HQ Version 1, exactly the
// mistake already made and fixed once in Phase 4B-2D-D). HQ-role test
// coverage is limited to Draft create/edit/discard (all safe, no lasting
// effect on the real HQ Published history) plus UI-visibility checks that
// never actually click Publish.
//
// Writes credentials + ids to a JSON file the Playwright tests read.
import bcrypt from 'bcrypt';
import { writeFileSync } from 'fs';
import { db } from '../src/lib/db.js';

const RUN_ID = `E2E_QCT_${Date.now()}`;
const PASSWORD = 'E2eTest!2026';

async function main() {
  // A previous E2E run that failed/was interrupted before its own "discard
  // Draft" step can leave a stray HQ-scope Draft behind, which then breaks
  // the next run's "No Draft in progress." starting-state assumption. Safe
  // to clean up unconditionally: only Draft-status rows are touched (never
  // Published/Superseded — mirrors QcTemplateVersionService.discardDraftVersion's
  // own status guard), so this can never affect the real HQ Published history.
  const staleHqDrafts = await db.qCChecklistTemplateVersion.findMany({
    where: { franchiseId: null, status: 'Draft' },
    select: { id: true },
  });
  if (staleHqDrafts.length > 0) {
    const ids = staleHqDrafts.map((d) => d.id);
    await db.qCChecklistTemplateVersionItem.deleteMany({ where: { versionId: { in: ids } } });
    await db.qCChecklistTemplateVersion.deleteMany({ where: { id: { in: ids } } });
    console.log(`Cleaned up ${ids.length} stale HQ-scope Draft version(s) from a previous run.`);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const franchiseA = await db.franchise.create({
    data: {
      id: `${RUN_ID}_FRAN_A`, name: `E2E QC Templates Franchise A`, city: "Chennai", owner: "E2E Tester A",
      phone: "9611111111", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });
  const franchiseB = await db.franchise.create({
    data: {
      id: `${RUN_ID}_FRAN_B`, name: `E2E QC Templates Franchise B`, city: "Bangalore", owner: "E2E Tester B",
      phone: "9622222222", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });

  // HQ user — SUPER_ADMIN always resolves to ALL_ACTIONS (resolveActionPermissionsPure),
  // no UserPermission seeding needed. Used ONLY for Draft create/edit/discard
  // and read-only/visibility checks — the E2E suite never clicks Publish as this user.
  const hqUser = await db.employee.create({
    data: {
      id: `${RUN_ID}_HQ`, name: 'E2E HQ Admin', username: `${RUN_ID}_hq`.toLowerCase(), password: passwordHash,
      role: 'SUPER_ADMIN', franchiseId: null, hqControlled: true, phone: '9611110001', email: `${RUN_ID}_hq@test.com`,
    },
  });

  // Franchise A admin — full manage+publish, used for the complete
  // Draft->Edit->Publish->Superseded flow against Franchise A's own
  // isolated, disposable scope (safe to actually publish in repeatedly).
  const franchiseAAdmin = await db.employee.create({
    data: {
      id: `${RUN_ID}_FA_ADMIN`, name: 'E2E Franchise A Admin', username: `${RUN_ID}_fa_admin`.toLowerCase(), password: passwordHash,
      role: 'FRANCHISE_ADMIN', franchiseId: franchiseA.id, phone: '9611110002', email: `${RUN_ID}_fa_admin@test.com`,
    },
  });
  await db.userPermission.create({
    data: { employeeId: franchiseAAdmin.id, modules: ['jobs'], actionsOverride: true, actions: ['qc:templates:manage', 'qc:templates:publish'] },
  });

  // Franchise B admin — manage only, NO publish — used to verify the
  // Publish button/action is correctly hidden/disabled when the grant is
  // absent, distinctly from the role-only heuristic this frontend never had before.
  const franchiseBAdmin = await db.employee.create({
    data: {
      id: `${RUN_ID}_FB_ADMIN`, name: 'E2E Franchise B Admin (manage only)', username: `${RUN_ID}_fb_admin`.toLowerCase(), password: passwordHash,
      role: 'FRANCHISE_ADMIN', franchiseId: franchiseB.id, phone: '9622220002', email: `${RUN_ID}_fb_admin@test.com`,
    },
  });
  await db.userPermission.create({
    data: { employeeId: franchiseBAdmin.id, modules: ['jobs'], actionsOverride: true, actions: ['qc:templates:manage'] },
  });

  // No-permission user — zero actions, used to verify the page's own
  // role gate ("Access restricted") for a role D-18/D-22 never grant to.
  // SERVICE_ADVISOR (not TECHNICIAN): the route middleware (proxy.ts)
  // redirects TECHNICIAN to a separate /technician portal entirely, so it
  // can never reach /dashboard/qc/templates to exercise this gate at all.
  const noPermissionUser = await db.employee.create({
    data: {
      id: `${RUN_ID}_NOPERM`, name: 'E2E No Permission User', username: `${RUN_ID}_noperm`.toLowerCase(), password: passwordHash,
      role: 'SERVICE_ADVISOR', franchiseId: franchiseA.id, phone: '9611110003', email: `${RUN_ID}_noperm@test.com`,
    },
  });

  const fixtures = {
    runId: RUN_ID,
    password: PASSWORD,
    franchiseAId: franchiseA.id,
    franchiseBId: franchiseB.id,
    hqUsername: hqUser.username,
    franchiseAAdminUsername: franchiseAAdmin.username,
    franchiseBAdminUsername: franchiseBAdmin.username,
    noPermissionUsername: noPermissionUser.username,
  };
  writeFileSync(new URL('./e2e-qc-templates-fixtures.json', import.meta.url), JSON.stringify(fixtures, null, 2));
  console.log('E2E fixtures created:', JSON.stringify(fixtures, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('E2E FIXTURE SETUP FAILED:', err);
  process.exit(1);
});
