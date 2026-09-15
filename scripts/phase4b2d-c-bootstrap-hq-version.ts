// Phase 4B-2D-C — one-time bootstrap turning the current live, global
// (franchiseId=null) QCChecklistTemplate rows into "HQ Version 1,
// Published". Run manually via tsx after the schema migration is applied —
// this is a data operation, not a schema migration, matching this repo's
// existing precedent (scripts/phase4a-dedupe-qc-inspections.ts).
//
// Idempotent: if the HQ scope already has a Published version, this script
// reports that and exits without creating a duplicate "Version 1" on a
// second run — this is also what makes the Part 17 concurrency test ("two
// concurrent bootstrap runs cannot produce two Published HQ versions")
// meaningful to exercise against the real script logic, not a special-cased
// shortcut.
import { db } from '../src/lib/db.js';
import { QcRepository } from '../src/modules/qc/qc.repository.js';
import { QcTemplateVersionService } from '../src/modules/qc/qc-template-version.service.js';

const SYSTEM_ACTOR = { id: 'SYSTEM_BOOTSTRAP', name: 'System Bootstrap', role: 'SUPER_ADMIN', franchiseId: null };

async function main() {
  const versionService = new QcTemplateVersionService();
  const qcRepository = new QcRepository();

  const existingPublished = await versionService.getPublishedVersion(null);
  if (existingPublished) {
    console.log(`HQ scope already has a Published version (Version ${existingPublished.versionNumber}, id ${existingPublished.id}) — bootstrap is a no-op.`);
    process.exit(0);
  }

  const liveGlobalRows = await qcRepository.findChecklistTemplate(null);
  const globalOnly = liveGlobalRows.filter((r) => r.franchiseId === null);
  console.log(`Found ${globalOnly.length} live global QCChecklistTemplate rows to bootstrap.`);

  if (globalOnly.length === 0) {
    console.log('No live global rows exist — nothing to bootstrap. Exiting without creating an empty version.');
    process.exit(0);
  }

  const items = globalOnly.map((r) => ({
    logicalItemId: r.logicalItemId,
    label: r.label,
    category: r.category,
    order: r.order,
    mandatory: r.mandatory,
  }));

  const draft = await versionService.createDraftVersion(items, SYSTEM_ACTOR);
  console.log(`Created Draft Version ${draft.versionNumber} (id ${draft.id}) with ${draft.items.length} items.`);

  const published = await versionService.publishVersion(draft.id, SYSTEM_ACTOR);
  console.log(`Published Version ${published.versionNumber} (id ${published.id}), status=${published.status}.`);

  console.log('\nBootstrap complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('BOOTSTRAP FAILED:', err);
  process.exit(1);
});
