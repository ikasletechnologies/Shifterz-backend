// Phase 4B-2E — E2E fixture teardown. Deletes ONLY this run's own isolated
// franchises/employees/versions (by RUN_ID, read from the fixtures file
// setup wrote) — never touches the real global (HQ) scope's version history.
// Also re-verifies the real HQ Version 1 is still exactly as bootstrapped
// (Part 41/42's explicit safety requirement), failing loudly if not, since
// that would mean something in this E2E run corrupted shared production-like
// state rather than staying inside its own isolated scopes.
import { readFileSync, existsSync } from 'fs';
import { db } from '../src/lib/db.js';

async function main() {
  const fixturesPath = new URL('./e2e-qc-templates-fixtures.json', import.meta.url);
  if (!existsSync(fixturesPath)) {
    console.log('No fixtures file found — nothing to tear down.');
    process.exit(0);
  }
  const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf-8'));
  const { franchiseAId, franchiseBId, runId } = fixtures;

  await db.qCChecklistTemplateVersion.deleteMany({ where: { franchiseId: { in: [franchiseAId, franchiseBId] } } });
  await db.userPermission.deleteMany({ where: { employee: { franchiseId: { in: [franchiseAId, franchiseBId] } } } });
  await db.session.deleteMany({ where: { employee: { franchiseId: { in: [franchiseAId, franchiseBId] } } } });
  await db.employee.deleteMany({ where: { id: { startsWith: runId } } });
  await db.franchise.deleteMany({ where: { id: { in: [franchiseAId, franchiseBId] } } });
  console.log(`Teardown complete for run ${runId}.`);

  // Production data safety verification (Part 22/41/42).
  const hqVersions = await db.qCChecklistTemplateVersion.findMany({ where: { franchiseId: null }, include: { items: true } });
  const publishedHq = hqVersions.filter((v) => v.status === 'Published');
  console.log(`\nHQ scope check: ${hqVersions.length} total version(s), ${publishedHq.length} Published.`);
  hqVersions.forEach((v) => console.log(`  v${v.versionNumber} status=${v.status} items=${v.items.length}`));

  if (publishedHq.length !== 1) {
    console.error(`FATAL: expected exactly 1 Published HQ version, found ${publishedHq.length}. PRODUCTION DATA SAFETY VIOLATION.`);
    process.exit(1);
  }
  if (publishedHq[0].versionNumber !== 1 || publishedHq[0].items.length !== 18) {
    console.error(`FATAL: HQ Published version is not the original bootstrap (expected v1/18 items, got v${publishedHq[0].versionNumber}/${publishedHq[0].items.length} items). PRODUCTION DATA SAFETY VIOLATION.`);
    process.exit(1);
  }
  console.log('HQ Version 1 (Published, 18 items) confirmed intact.');
  process.exit(0);
}

main().catch((err) => {
  console.error('E2E FIXTURE TEARDOWN FAILED:', err);
  process.exit(1);
});
