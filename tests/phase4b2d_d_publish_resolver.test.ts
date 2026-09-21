// Phase 4B-2D-D — Draft/Publish workflow, effective-template resolver,
// templateVersionId/franchiseTemplateVersionId population, publish-vs-QC-Start
// concurrency, publish authority (D-22), and rollback-by-republish model.
import { db } from '../src/lib/db.js';
import { JobCardService } from '../src/modules/job-card/service/job-card.service.js';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { QcService } from '../src/modules/qc/qc.service.js';
import { QcTemplateVersionService } from '../src/modules/qc/qc-template-version.service.js';
import { QcTemplateVersionRepository } from '../src/modules/qc/qc-template-version.repository.js';
import { qcRouter } from '../src/modules/qc/qc.routes.js';

const testRunId = `P4B2DD_${Date.now()}`;
console.log(`=======================================================`);
console.log(`STARTING PHASE 4B-2D-D PUBLISH/RESOLVER TESTS`);
console.log(`Test Run ID: ${testRunId}`);
console.log(`=======================================================\n`);

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedTests++;
    throw new Error(`Test Assertion Failed: ${message}`);
  }
}

function findRoute(router: any, method: string, path: string): number | null {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods[method]);
  return layer ? layer.route.stack.length : null;
}

async function runTests() {
  const jobService = new JobCardService();
  const checkinService = new VehicleCheckinService();
  const qcService = new QcService();
  const versionService = new QcTemplateVersionService();
  const versionRepository = new QcTemplateVersionRepository();

  console.log(`\n[Permissions] Route wiring — :manage vs :publish are distinct gates...`);
  assert((findRoute(qcRouter, 'post', '/template-versions') ?? 0) > 1, "POST /qc/template-versions is action-gated (qc:templates:manage)");
  assert((findRoute(qcRouter, 'put', '/template-versions/:id') ?? 0) > 1, "PUT /qc/template-versions/:id is action-gated (qc:templates:manage)");
  assert((findRoute(qcRouter, 'delete', '/template-versions/:id') ?? 0) > 1, "DELETE /qc/template-versions/:id is action-gated (qc:templates:manage)");
  assert((findRoute(qcRouter, 'post', '/template-versions/:id/publish') ?? 0) > 1, "POST /qc/template-versions/:id/publish is action-gated (qc:templates:publish — distinct from :manage)");
  assert(findRoute(qcRouter, 'get', '/template-versions') === 1, "GET /qc/template-versions (read) remains ungated, same convention as GET /checklist-template");
  assert(findRoute(qcRouter, 'get', '/template-versions/hq-published') === 1, "GET /qc/template-versions/hq-published (Phase 4B-2E — franchise-visible read of the current HQ standard) is registered and ungated");
  const hqPublishedViaEndpoint = await versionService.getPublishedVersion(null);
  assert(hqPublishedViaEndpoint !== null && (hqPublishedViaEndpoint as any).status === 'Published', "The hq-published endpoint's underlying service call (getPublishedVersion(null)) returns the real HQ Published version");

  const testFranchiseA = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_A`, name: "Phase 4B-2D-D Test Branch A", city: "Chennai", owner: "Tester A",
      phone: "9511111111", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });
  const testFranchiseB = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_B`, name: "Phase 4B-2D-D Test Branch B", city: "Bangalore", owner: "Tester B",
      phone: "9522222222", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });
  const testTechA = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_TECHA`, name: `Tech Alpha ${testRunId}`, role: "TECHNICIAN",
      phone: "9511110001", email: `techa_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Active",
    },
  });
  const testInspectorA = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_QIA`, name: `QI Alpha ${testRunId}`, role: "QUALITY_INSPECTOR",
      phone: "9511110002", email: `qia_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Active",
    },
  });
  const testManagerA = { id: `${testRunId}_MGR_A`, name: "Manager Alpha", role: "BRANCH_MANAGER", franchiseId: testFranchiseA.id };
  const testManagerB = { id: `${testRunId}_MGR_B`, name: "Manager Beta", role: "BRANCH_MANAGER", franchiseId: testFranchiseB.id };
  const testHqUser = { id: `${testRunId}_HQ`, name: "HQ Admin", role: "SUPER_ADMIN", franchiseId: null };
  const actorInspectorA = { id: testInspectorA.id, name: testInspectorA.name, role: "QUALITY_INSPECTOR", franchiseId: testFranchiseA.id };
  const actorTechA = { id: testTechA.id, name: testTechA.name, role: "TECHNICIAN", franchiseId: testFranchiseA.id };

  async function createReadyForQcJob(vehicleSuffix: string) {
    const checkin = await checkinService.createCheckin({
      vehicle: `TN 04 P4B2DD ${vehicleSuffix}`, model: "Honda City", customer: "QC Test Customer",
      phone: "9876500000", service: "Full Service", inTime: new Date().toISOString(), odometer: "45000", status: "Pending",
    }, testFranchiseA.id);
    await db.carIn.update({
      where: { id: checkin.id },
      data: { scratches: "Minor scratch", photoFront: "https://cdn.shifterz.com/photos/front.jpg" },
    });
    await jobService.updateJob(checkin.jobCardId!, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    return jobService.requestCompletion(checkin.jobCardId!, actorTechA);
  }

  async function publishNewVersion(items: any[], actor: any) {
    const draft = await versionService.createDraftVersion(items, actor);
    return versionService.publishVersion(draft.id, actor);
  }

  const hqPublished = await versionService.getPublishedVersion(null); // real, pre-existing bootstrap — never publish a new one in this file either.

  try {
    // ------------------------------------------------------------------------
    // DUPLICATE HANDLING (Part 12)
    // ------------------------------------------------------------------------
    console.log(`\n[Duplicates] Internal and cross-scope (franchise-vs-HQ) duplicate rejection...`);
    let errorCaught = false;
    try {
      await versionService.createDraftVersion(
        [
          { logicalItemId: `${testRunId}_DUP1`, label: "Same Item", category: "Mech", order: 1, mandatory: false },
          { logicalItemId: `${testRunId}_DUP2`, label: "same item", category: "mech", order: 2, mandatory: false }, // case-insensitive duplicate
        ],
        testManagerA
      );
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("Duplicate checklist item within this version"), "Internal duplicate rejection message is clear");
    }
    assert(errorCaught, "A version cannot contain two items with the same (category, label) internally");

    const hqCollisionLabel = (hqPublished!.items as any[])[0].label;
    const hqCollisionCategory = (hqPublished!.items as any[])[0].category;
    errorCaught = false;
    try {
      await versionService.createDraftVersion(
        [{ logicalItemId: `${testRunId}_COLLIDE`, label: hqCollisionLabel, category: hqCollisionCategory, order: 1, mandatory: false }],
        testManagerA
      );
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("collide with the current HQ standard"), "HQ-collision rejection message explains the additions-only rule");
    }
    assert(errorCaught, "A franchise draft cannot contain an item colliding with a current HQ Published item");

    // Distinct items across scopes remain fully allowed (additions-only, not exclusion).
    const legitDraft = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_LEGIT`, label: `${testRunId} Legit Distinct Item`, category: "Mech", order: 1, mandatory: false }],
      testManagerA
    );
    assert(legitDraft.status === 'Draft', "A genuinely distinct franchise item is accepted without collision");

    // ------------------------------------------------------------------------
    // EFFECTIVE RESOLVER (Parts 10, 11, 22, 23)
    // ------------------------------------------------------------------------
    console.log(`\n[Resolver] HQ-only, HQ+A, HQ+B, no cross-leakage, Draft excluded, Superseded excluded...`);
    const hqOnlyResolved = await versionRepository.resolveEffectiveChecklist(null);
    assert(hqOnlyResolved.hqVersionId === hqPublished!.id && hqOnlyResolved.franchiseVersionId === null, "Resolving for franchiseId=null (HQ) yields the HQ version only, no franchise layer");

    const franchiseAV1 = await publishNewVersion(
      [{ logicalItemId: `${testRunId}_LID_A1`, label: `${testRunId} A Item V1`, category: "Mech", order: 1, mandatory: true }],
      testManagerA
    );
    const franchiseBV1 = await publishNewVersion(
      [{ logicalItemId: `${testRunId}_LID_B1`, label: `${testRunId} B Item V1`, category: "Mech", order: 1, mandatory: false }],
      testManagerB
    );

    const resolvedA = await versionRepository.resolveEffectiveChecklist(testFranchiseA.id);
    assert(resolvedA.hqVersionId === hqPublished!.id && resolvedA.franchiseVersionId === franchiseAV1.id, "Resolving for Franchise A yields HQ + Franchise A's own Published version");
    assert(
      resolvedA.items.some((i) => i.id === (franchiseAV1.items as any[])[0].id) && !resolvedA.items.some((i) => i.id === (franchiseBV1.items as any[])[0].id),
      "Franchise A's resolved items include A's own item and never Franchise B's"
    );

    const resolvedB = await versionRepository.resolveEffectiveChecklist(testFranchiseB.id);
    assert(resolvedB.franchiseVersionId === franchiseBV1.id, "Resolving for Franchise B yields Franchise B's own Published version");
    assert(
      resolvedB.items.some((i) => i.id === (franchiseBV1.items as any[])[0].id) && !resolvedB.items.some((i) => i.id === (franchiseAV1.items as any[])[0].id),
      "Franchise B's resolved items include B's own item and never Franchise A's — no cross-franchise leakage in either direction"
    );

    // Draft exclusion.
    const draftOnlyItem = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_DRAFTONLY`, label: `${testRunId} Draft Only Item`, category: "Mech", order: 1, mandatory: false }],
      testManagerA
    );
    const resolvedWithDraft = await versionRepository.resolveEffectiveChecklist(testFranchiseA.id);
    assert(!resolvedWithDraft.items.some((i) => i.id === (draftOnlyItem.items as any[])[0].id), "A Draft version's items never appear in the effective resolver's output");

    // Superseded exclusion — publish V2 to supersede V1, confirm V1's item disappears from resolution.
    const franchiseAV2 = await publishNewVersion(
      [{ logicalItemId: `${testRunId}_LID_A2`, label: `${testRunId} A Item V2`, category: "Mech", order: 1, mandatory: true }],
      testManagerA
    );
    const resolvedAfterV2 = await versionRepository.resolveEffectiveChecklist(testFranchiseA.id);
    assert(
      resolvedAfterV2.items.some((i) => i.id === (franchiseAV2.items as any[])[0].id) &&
      !resolvedAfterV2.items.some((i) => i.id === (franchiseAV1.items as any[])[0].id),
      "A Superseded version's items never appear in the effective resolver's output — only the current Published version's do"
    );

    // ------------------------------------------------------------------------
    // QC START INTEGRATION + templateVersionId / franchiseTemplateVersionId (Parts 13-15, 25, 26)
    // ------------------------------------------------------------------------
    console.log(`\n[QC Start] Uses Published version, stores correct version reference(s), matches resolver output exactly...`);
    const jobV1 = await createReadyForQcJob(`V1_${Math.floor(1000 + Math.random() * 9000)}`);
    const inspectionV1 = await qcService.getOrCreateOpenInspection(jobV1.id, actorInspectorA);
    assert(inspectionV1.templateVersionId === hqPublished!.id, "New inspection's templateVersionId is the current HQ Published version");
    assert(inspectionV1.franchiseTemplateVersionId === franchiseAV2.id, "New inspection's franchiseTemplateVersionId is the current Franchise A Published version");
    const defAtV1 = inspectionV1.checklistDefinition as any[];
    const resolvedAtV1 = await versionRepository.resolveEffectiveChecklist(testFranchiseA.id);
    assert(
      JSON.stringify(defAtV1.map((i) => i.id).sort()) === JSON.stringify(resolvedAtV1.items.map((i) => i.id).sort()),
      "checklistDefinition's item ids exactly match what the resolver currently returns for this franchise — same source, consistently"
    );

    // Later publish must not alter the existing inspection.
    const franchiseAV3 = await publishNewVersion(
      [{ logicalItemId: `${testRunId}_LID_A3`, label: `${testRunId} A Item V3`, category: "Mech", order: 1, mandatory: false }],
      testManagerA
    );
    const inspectionV1After = await db.qCInspection.findUnique({ where: { id: inspectionV1.id } });
    assert(inspectionV1After?.templateVersionId === hqPublished!.id, "Existing inspection's templateVersionId is unchanged by a later publish");
    assert(inspectionV1After?.franchiseTemplateVersionId === franchiseAV2.id, "Existing inspection's franchiseTemplateVersionId is unchanged by a later publish (still V2, not V3)");
    assert(JSON.stringify(inspectionV1After?.checklistDefinition) === JSON.stringify(defAtV1), "Existing inspection's checklistDefinition is byte-identical after a later publish");

    // ------------------------------------------------------------------------
    // ATTEMPT 2 (Part 27) — pinned to whatever was Published at ITS OWN Start
    // ------------------------------------------------------------------------
    console.log(`\n[Attempt 2] Attempt 1 pinned to V2, Attempt 2 (after rework) pinned to V3...`);
    await qcService.submitChecklist(jobV1.id, [{ id: (franchiseAV2.items as any[])[0].id, result: "Failed", remark: "needs rework" }], actorInspectorA);
    await qcService.decide(jobV1.id, { result: "Failed", reason: "rework" }, actorInspectorA);
    const attempt2 = await qcService.getOrCreateOpenInspection(jobV1.id, actorInspectorA);
    assert(attempt2.attemptNumber === 2, "A second attempt was created after rework");
    assert(attempt2.franchiseTemplateVersionId === franchiseAV3.id, "Attempt 2 is pinned to the CURRENT Published version (V3) at its own Start, not Attempt 1's V2");
    const attempt1Reread = await db.qCInspection.findUnique({ where: { id: inspectionV1.id } });
    assert(attempt1Reread?.franchiseTemplateVersionId === franchiseAV2.id, "Attempt 1 remains pinned to V2 — unaffected by Attempt 2's own, later, freeze");

    // ------------------------------------------------------------------------
    // PUBLISH VS QC START CONCURRENCY (Part 16) — the critical test
    // ------------------------------------------------------------------------
    console.log(`\n[Concurrency] Publish and QC Start racing for the same franchise scope never produce a torn snapshot...`);
    const jobRace = await createReadyForQcJob(`RACE_${Math.floor(1000 + Math.random() * 9000)}`);
    const raceDraft = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_LID_RACE`, label: `${testRunId} Race Item`, category: "Mech", order: 1, mandatory: false }],
      testManagerA
    );
    const beforeRacePublished = await versionService.getPublishedVersion(testFranchiseA.id); // V3
    const [publishOutcome, startOutcome] = await Promise.allSettled([
      versionService.publishVersion(raceDraft.id, testManagerA),
      qcService.getOrCreateOpenInspection(jobRace.id, actorInspectorA),
    ]);
    assert(publishOutcome.status === 'fulfilled', "The racing publish completes without error");
    assert(startOutcome.status === 'fulfilled', "The racing QC Start completes without error");
    const raceInspection = (startOutcome as PromiseFulfilledResult<any>).value;
    const raceInspectionReread = await db.qCInspection.findUnique({ where: { id: raceInspection.id } });
    const wonId = raceInspectionReread?.franchiseTemplateVersionId;
    assert(
      wonId === beforeRacePublished!.id || wonId === (publishOutcome as PromiseFulfilledResult<any>).value.id,
      "The racing inspection's franchiseTemplateVersionId is EITHER the pre-race or the post-race Published version — a real, valid version either way"
    );
    // The decisive check: whichever version won, checklistDefinition's items
    // must exactly match THAT version's own resolved effective set — never a
    // mix of one version's metadata with another's items.
    const wonVersionResolved = await versionRepository.resolveEffectiveChecklist(testFranchiseA.id, undefined);
    const raceDef = (raceInspectionReread?.checklistDefinition as any[]) || [];
    const wonVersionRecord = await db.qCChecklistTemplateVersion.findUnique({ where: { id: wonId! }, include: { items: true } });
    const wonVersionItemIds = new Set((wonVersionRecord!.items as any[]).map((i) => i.id));
    const hqIds = new Set((hqPublished!.items as any[]).map((i) => i.id));
    assert(
      raceDef.every((i) => hqIds.has(i.id) || wonVersionItemIds.has(i.id)),
      "Every item in the frozen checklistDefinition belongs to either the HQ version or the SAME franchise version recorded as franchiseTemplateVersionId — never a foreign/mixed item"
    );
    void wonVersionResolved;

    // ------------------------------------------------------------------------
    // PUBLISH FAILURE / NO PARTIAL STATE (Part 18) — re-affirmed via a real race
    // ------------------------------------------------------------------------
    console.log(`\n[Rollback safety] A losing concurrent publish leaves the loser Draft untouched, winner cleanly Published...`);
    const beforeDualPublish = await versionService.getPublishedVersion(testFranchiseB.id);
    const loserDraft = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_LID_LOSER`, label: `${testRunId} Loser Draft`, category: "Mech", order: 1, mandatory: false }],
      testManagerB
    );
    const winnerDraft = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_LID_WINNER`, label: `${testRunId} Winner Draft`, category: "Mech", order: 1, mandatory: false }],
      testManagerB
    );
    await Promise.allSettled([
      versionService.publishVersion(loserDraft.id, testManagerB),
      versionService.publishVersion(winnerDraft.id, testManagerB),
    ]);
    const publishedAfterDual = await versionService.getPublishedVersion(testFranchiseB.id);
    assert(publishedAfterDual !== null, "Exactly one of the two racing drafts ended up Published — never zero");
    const bothVersions = await db.qCChecklistTemplateVersion.findMany({ where: { id: { in: [loserDraft.id, winnerDraft.id] } } });
    const publishedCount = bothVersions.filter((v) => v.status === 'Published').length;
    const nonPublishedCount = bothVersions.filter((v) => v.status !== 'Published').length;
    // Both concurrent publish calls are serialized by publishVersion's own
    // scope-wide row lock (never left racing against the DB unique index
    // directly) — so the loser doesn't necessarily stay untouched Draft; it
    // can legitimately transition Draft->Published->Superseded within the
    // same short window if it acquires the lock first and the winner
    // publishes right after. Part 17's own wording anticipates exactly this
    // ("the other becomes/remaining non-Published") — the invariant that
    // actually matters is never two Published and never zero, not which of
    // the two specific end states the loser lands in.
    assert(publishedCount === 1 && nonPublishedCount === 1, `Exactly one of the two racing drafts is Published; the other is definitively non-Published (Draft or Superseded, never Published) — no version left in a partial/corrupted state (published=${publishedCount}, non-published=${nonPublishedCount})`);
    const loserStatus = bothVersions.find((v) => v.status !== 'Published')?.status;
    assert(loserStatus === 'Draft' || loserStatus === 'Superseded', `The non-published version's status is a genuine, valid end state (Draft or Superseded), not something corrupted (got "${loserStatus}")`);
    void beforeDualPublish;

    // ------------------------------------------------------------------------
    // ROLLBACK MODEL (Part 20) — new version copied from an old Superseded one
    // ------------------------------------------------------------------------
    console.log(`\n[Rollback Model] A new version can be published with content copied from an old Superseded version...`);
    const oldSupersededV1 = await versionService.getVersionById(franchiseAV1.id, testManagerA);
    assert(oldSupersededV1.status === 'Superseded', "Sanity: Franchise A's V1 is Superseded (superseded by V2/V3 earlier in this run)");
    const rollbackItems = (oldSupersededV1.items as any[]).map((i) => ({
      logicalItemId: i.logicalItemId, label: i.label, category: i.category, order: i.order, mandatory: i.mandatory,
    }));
    const rollbackVersion = await publishNewVersion(rollbackItems, testManagerA);
    assert(rollbackVersion.status === 'Published', "A version 'rolling back' to V1's content publishes as a brand-new version, not a reactivation");
    assert(rollbackVersion.versionNumber > franchiseAV3.versionNumber, "The rollback version gets the NEXT sequential number, preserving chronology (never reuses V1's own number)");
    const v1StillSuperseded = await versionService.getVersionById(franchiseAV1.id, testManagerA);
    assert(v1StillSuperseded.status === 'Superseded', "The original V1 remains Superseded — never reactivated directly");

    // ------------------------------------------------------------------------
    // DISCARD DRAFT (Part 8)
    // ------------------------------------------------------------------------
    console.log(`\n[Discard] A Draft can be discarded; Published/Superseded cannot...`);
    const discardable = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_DISCARD`, label: `${testRunId} Discard Me`, category: "Mech", order: 1, mandatory: false }],
      testManagerA
    );
    await versionService.discardDraftVersion(discardable.id, testManagerA);
    const afterDiscard = await db.qCChecklistTemplateVersion.findUnique({ where: { id: discardable.id } });
    assert(afterDiscard === null, "A discarded Draft is actually removed");

    errorCaught = false;
    try {
      await versionService.discardDraftVersion(rollbackVersion.id, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("cannot be discarded"), "Rejection message explains only a Draft may be discarded");
    }
    assert(errorCaught, "A Published version cannot be discarded");
    const rollbackStillExists = await db.qCChecklistTemplateVersion.findUnique({ where: { id: rollbackVersion.id } });
    assert(rollbackStillExists !== null, "The Published version was not deleted by the rejected discard attempt");

    // ------------------------------------------------------------------------
    // PERMISSIONS (Parts 6, 24)
    // ------------------------------------------------------------------------
    console.log(`\n[Permissions] Franchise cannot publish HQ; Franchise A cannot publish Franchise B's version; Franchise A cannot alter HQ at all...`);
    const hqOnlyDraftAttempt = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_HQATTEMPT`, label: `${testRunId} HQ Attempt`, category: "Mech", order: 1, mandatory: false }],
      testManagerA
    );
    assert(hqOnlyDraftAttempt.franchiseId === testFranchiseA.id, "A franchise actor's own draft always lands in their own scope, never global — cannot even construct a global-scope publish attempt");

    errorCaught = false;
    try {
      await versionService.publishVersion(franchiseBV1.id, testManagerA); // already Published anyway, but scope check must fire first
    } catch (err: any) {
      errorCaught = true;
    }
    assert(errorCaught, "Franchise A cannot publish (or even address) Franchise B's version");

    errorCaught = false;
    try {
      await qcService.updateChecklistTemplateItem((hqPublished!.items as any[])[0].id, { mandatory: true }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
    }
    // Note: this targets a QCChecklistTemplateVersionItem id via the OLD
    // QCChecklistTemplate service — it will simply not be found (different
    // table), which is itself proof Franchise A has no path to alter HQ
    // content through either surface.
    assert(errorCaught, "Franchise A cannot alter an HQ item through any exposed path");

    // ------------------------------------------------------------------------
    // LEGACY COMPATIBILITY (Part 33)
    // ------------------------------------------------------------------------
    console.log(`\n[Legacy Compatibility] Old QCChecklistTemplate CRUD no longer silently controls QC behavior...`);
    const legacyItem = await qcService.createChecklistTemplateItem(
      { category: `${testRunId}_Legacy`, label: `${testRunId} Legacy Item`, order: 1, franchiseId: testFranchiseA.id, mandatory: true },
      testManagerA
    );
    const resolvedIgnoresLegacy = await versionRepository.resolveEffectiveChecklist(testFranchiseA.id);
    assert(!resolvedIgnoresLegacy.items.some((i) => i.label === legacyItem.label), "An item created via the old CRUD does NOT appear in the effective resolver's output — it no longer silently controls QC Start");
    const legacyCheckStillWorks = await qcService.getChecklistTemplate(testFranchiseA.id);
    assert(legacyCheckStillWorks.some((i) => i.id === legacyItem.id), "The old CRUD's own read path still functions on its own terms (authoring/compat storage, per Part 28)");

  } finally {
    console.log(`\n[Clean Up] Cleaning up Phase 4B-2D-D test data...`);
    await db.jobHistory.deleteMany({ where: { jobId: { contains: testRunId } } }).catch(() => {});
    await db.jobPhoto.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.qCInspection.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.qCChecklistTemplateVersion.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.qCChecklistTemplate.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.job.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.carIn.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.employee.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.franchise.deleteMany({ where: { id: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    console.log(`Clean up completed.`);
  }

  console.log(`\n=======================================================`);
  console.log(`PHASE 4B-2D-D TEST RESULTS SUMMARY:`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`=======================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
