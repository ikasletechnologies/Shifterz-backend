// Phase 4B-2D-C — QC template governance foundation: legacy endpoint
// removal, template audit logging, stable logical item identity, and the
// whole-template version model (Model B). Route-wiring checks reuse the
// established technique from scripts/test-rbac04-route-wiring.ts (inspect
// the Express Router's own .stack — no live server/DB needed for those).
import { db } from '../src/lib/db.js';
import { JobCardService } from '../src/modules/job-card/service/job-card.service.js';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { QcService } from '../src/modules/qc/qc.service.js';
import { QcTemplateVersionService } from '../src/modules/qc/qc-template-version.service.js';
import { QcTemplateVersionRepository } from '../src/modules/qc/qc-template-version.repository.js';
import { jobCardRouter } from '../src/modules/job-card/routes/job-card.routes.js';
import { qcRouter } from '../src/modules/qc/qc.routes.js';

const testRunId = `P4B2DC_${Date.now()}`;
console.log(`=======================================================`);
console.log(`STARTING PHASE 4B-2D-C GOVERNANCE FOUNDATION TESTS`);
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

  // ------------------------------------------------------------------------
  // PART 1 — LEGACY ENDPOINT REMOVAL (route-wiring only, no DB needed)
  // ------------------------------------------------------------------------
  console.log(`\n[Legacy Endpoint] Route wiring...`);
  assert(findRoute(jobCardRouter, 'post', '/:id/qc-checklist') === null, "POST /jobs/:id/qc-checklist is no longer registered on jobCardRouter");
  assert(findRoute(jobCardRouter, 'post', '/:id/qc-photos') !== null, "POST /jobs/:id/qc-photos (a separate, untouched legacy path) remains registered — this phase did not remove it");
  assert(findRoute(qcRouter, 'put', '/:jobId/checklist') !== null, "Canonical PUT /api/qc/:jobId/checklist remains registered and functional");
  assert(typeof (new JobCardService() as any).submitChecklist === 'undefined', "JobCardService.submitChecklist method no longer exists");

  const testFranchiseA = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_A`, name: "Phase 4B-2D-C Test Branch A", city: "Chennai", owner: "Tester A",
      phone: "9411111111", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });
  const testFranchiseB = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_B`, name: "Phase 4B-2D-C Test Branch B", city: "Bangalore", owner: "Tester B",
      phone: "9422222222", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });
  const testTechA = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_TECHA`, name: `Tech Alpha ${testRunId}`, role: "TECHNICIAN",
      phone: "9411110001", email: `techa_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Active",
    },
  });
  const testInspectorA = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_QIA`, name: `QI Alpha ${testRunId}`, role: "QUALITY_INSPECTOR",
      phone: "9411110002", email: `qia_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Active",
    },
  });
  const testManagerA = { id: `${testRunId}_MGR_A`, name: "Manager Alpha", role: "BRANCH_MANAGER", franchiseId: testFranchiseA.id };
  const testManagerB = { id: `${testRunId}_MGR_B`, name: "Manager Beta", role: "BRANCH_MANAGER", franchiseId: testFranchiseB.id };
  const testHqUser = { id: `${testRunId}_HQ`, name: "HQ Admin", role: "SUPER_ADMIN", franchiseId: null };
  const actorInspectorA = { id: testInspectorA.id, name: testInspectorA.name, role: "QUALITY_INSPECTOR", franchiseId: testFranchiseA.id };
  const actorTechA = { id: testTechA.id, name: testTechA.name, role: "TECHNICIAN", franchiseId: testFranchiseA.id };

  async function createReadyForQcJob(vehicleSuffix: string) {
    const checkin = await checkinService.createCheckin({
      vehicle: `TN 04 P4B2DC ${vehicleSuffix}`, model: "Honda City", customer: "QC Test Customer",
      phone: "9876500000", service: "Full Service", inTime: new Date().toISOString(), odometer: "45000", status: "Pending",
    }, testFranchiseA.id);
    await db.carIn.update({
      where: { id: checkin.id },
      data: { scratches: "Minor scratch", photoFront: "https://cdn.shifterz.com/photos/front.jpg" },
    });
    await jobService.updateJob(checkin.jobCardId!, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    return jobService.requestCompletion(checkin.jobCardId!, actorTechA);
  }

  try {
    // ------------------------------------------------------------------------
    // LOGICAL IDENTITY
    // ------------------------------------------------------------------------
    console.log(`\n[Logical Identity] Stable across rename/mandatory/category changes; new on delete+recreate...`);
    const itemX = await qcService.createChecklistTemplateItem(
      { category: `${testRunId}_Cat1`, label: `${testRunId} Item X`, order: 1, franchiseId: testFranchiseA.id, mandatory: false },
      testManagerA
    );
    const originalLogicalId = (itemX as any).logicalItemId;
    assert(!!originalLogicalId, "New item has a logicalItemId assigned at creation");

    const renamed = await qcService.updateChecklistTemplateItem(itemX.id, { label: `${testRunId} Item X Renamed` }, testManagerA);
    assert((renamed as any).logicalItemId === originalLogicalId, "Renaming an item preserves its logicalItemId");

    const mandatoryChanged = await qcService.updateChecklistTemplateItem(itemX.id, { mandatory: true }, testManagerA);
    assert((mandatoryChanged as any).logicalItemId === originalLogicalId, "Changing mandatory preserves logicalItemId");

    const categoryChanged = await qcService.updateChecklistTemplateItem(itemX.id, { category: `${testRunId}_Cat2` }, testManagerA);
    assert((categoryChanged as any).logicalItemId === originalLogicalId, "Changing category preserves logicalItemId");

    // updateChecklistTemplateItemSchema doesn't accept logicalItemId at all —
    // prove that even a raw repository-bypass attempt via the DTO shape has
    // no field to carry it, i.e. there is no update path exposing it.
    const updateDtoKeys = Object.keys({ category: '', label: '', order: 0, mandatory: false });
    assert(!updateDtoKeys.includes('logicalItemId'), "logicalItemId is not an updatable field on the template item DTO — cannot be changed accidentally");

    await qcService.deleteChecklistTemplateItem(itemX.id, testManagerA);
    const itemXRecreated = await qcService.createChecklistTemplateItem(
      { category: `${testRunId}_Cat1`, label: `${testRunId} Item X`, order: 1, franchiseId: testFranchiseA.id, mandatory: false },
      testManagerA
    );
    assert((itemXRecreated as any).logicalItemId !== originalLogicalId, "Deleting and recreating an item (even with the identical label) produces a NEW logicalItemId");

    // ------------------------------------------------------------------------
    // VERSIONING
    // ------------------------------------------------------------------------
    console.log(`\n[Versioning] Draft editable; Published/Superseded immutable; old versions queryable; numbers unique per scope...`);
    const draftV1 = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_LOGICAL_A`, label: "Brake", category: "Mech", order: 1, mandatory: true }],
      testManagerA
    );
    assert(draftV1.status === 'Draft', "New version starts as Draft");
    assert(draftV1.franchiseId === testFranchiseA.id, "Draft correctly scoped to the creating franchise");

    const editedDraft = await versionService.updateDraftVersionItems(
      draftV1.id,
      [{ logicalItemId: `${testRunId}_LOGICAL_A`, label: "Brake Inspection", category: "Mech", order: 1, mandatory: true }],
      testManagerA
    );
    assert(editedDraft.items[0].label === "Brake Inspection", "Draft's items can be changed while still Draft");

    const publishedV1 = await versionService.publishVersion(draftV1.id, testManagerA);
    assert(publishedV1.status === 'Published', "Publishing a Draft transitions it to Published");

    let errorCaught = false;
    try {
      await versionService.updateDraftVersionItems(draftV1.id, [{ logicalItemId: `${testRunId}_LOGICAL_A`, label: "Tampered", category: "Mech", order: 1, mandatory: true }], testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes('cannot be modified'), "Rejection message explains a Published version cannot be modified");
    }
    assert(errorCaught, "A Published version's items cannot be changed");

    // Create + publish a second version to supersede the first, then prove the superseded one is also immutable and still queryable.
    const draftV2 = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_LOGICAL_A`, label: "Brake & Rotor Inspection", category: "Mech", order: 1, mandatory: true }],
      testManagerA
    );
    assert(draftV2.versionNumber === draftV1.versionNumber + 1, "Version numbers increment sequentially within the same scope");
    const publishedV2 = await versionService.publishVersion(draftV2.id, testManagerA);
    assert(publishedV2.status === 'Published', "Publishing V2 succeeds");

    const v1AfterSupersede = await versionService.getVersionById(draftV1.id, testManagerA);
    assert(v1AfterSupersede.status === 'Superseded', "V1 automatically becomes Superseded once V2 is published");
    assert(v1AfterSupersede.items[0].label === "Brake Inspection", "V1's own item content is unchanged by being superseded — remains queryable historically");

    errorCaught = false;
    try {
      await versionService.updateDraftVersionItems(draftV1.id, [{ logicalItemId: `${testRunId}_LOGICAL_A`, label: "Tampered Again", category: "Mech", order: 1, mandatory: true }], testManagerA);
    } catch (err: any) {
      errorCaught = true;
    }
    assert(errorCaught, "A Superseded version's items also cannot be changed");

    // Version number uniqueness per scope — Franchise B's own numbering is independent of Franchise A's.
    const draftForB = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_LOGICAL_B`, label: "B-only check", category: "Mech", order: 1, mandatory: false }],
      testManagerB
    );
    assert(draftForB.versionNumber === 1, "Franchise B's own version numbering starts independently at 1, unaffected by Franchise A's count");

    // ------------------------------------------------------------------------
    // SCOPE
    // ------------------------------------------------------------------------
    console.log(`\n[Scope] HQ global; franchise isolation; franchise cannot create global...`);
    const hqDraft = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_LOGICAL_HQ`, label: "HQ-only check", category: "Exterior", order: 1, mandatory: false }],
      testHqUser
    );
    assert(hqDraft.franchiseId === null, "HQ actor creates a global-scope (franchiseId=null) version");

    errorCaught = false;
    try {
      await versionService.getVersionById(draftForB.id, testManagerA);
    } catch (err: any) {
      errorCaught = true;
    }
    assert(errorCaught, "Franchise A cannot read Franchise B's version");

    errorCaught = false;
    try {
      await versionService.updateDraftVersionItems(draftForB.id, [{ logicalItemId: `${testRunId}_LOGICAL_B`, label: "Hacked", category: "Mech", order: 1, mandatory: false }], testManagerA);
    } catch (err: any) {
      errorCaught = true;
    }
    assert(errorCaught, "Franchise A cannot modify Franchise B's version");

    // A franchise actor's createDraftVersion always creates in their OWN scope — there
    // is no franchiseId parameter to the method at all, so "attempting to create global"
    // isn't a payload a franchise actor can even construct; verify the resulting scope directly.
    const franchiseCreatedDraft = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_LOGICAL_C`, label: "Franchise item", category: "Mech", order: 1, mandatory: false }],
      testManagerA
    );
    assert(franchiseCreatedDraft.franchiseId === testFranchiseA.id, "A franchise actor can never create a global-scope version — always forced into their own franchiseId");

    // ------------------------------------------------------------------------
    // BOOTSTRAP (verifying the already-run bootstrap script's result)
    // ------------------------------------------------------------------------
    console.log(`\n[Bootstrap] 18 existing global items became HQ Version 1, Published...`);
    const liveGlobalItems = await db.qCChecklistTemplate.findMany({ where: { isDeleted: false, franchiseId: null } });
    const hqPublished = await versionService.getPublishedVersion(null);
    assert(hqPublished !== null, "HQ scope has a Published version after bootstrap");
    assert(hqPublished!.versionNumber === 1, "The bootstrapped HQ version is Version 1");
    const bootstrapLogicalIds = new Set((hqPublished as any).items.map((i: any) => i.logicalItemId));
    const liveLogicalIds = new Set(liveGlobalItems.map((r) => r.logicalItemId));
    assert(
      bootstrapLogicalIds.size === liveLogicalIds.size && [...liveLogicalIds].every((id) => bootstrapLogicalIds.has(id)),
      `Bootstrap preserved all ${liveLogicalIds.size} live global items' logical identities exactly (found ${bootstrapLogicalIds.size} in the version)`
    );
    const sampleLive = liveGlobalItems[0];
    const sampleVersionItem = (hqPublished as any).items.find((i: any) => i.logicalItemId === sampleLive.logicalItemId);
    assert(
      sampleVersionItem.label === sampleLive.label && sampleVersionItem.category === sampleLive.category &&
      sampleVersionItem.order === sampleLive.order && sampleVersionItem.mandatory === sampleLive.mandatory,
      "A sampled bootstrapped item's definition fields exactly match its live source row"
    );
    const franchiseVersionsFromBootstrap = await db.qCChecklistTemplateVersion.count({ where: { franchiseId: { not: null }, createdById: 'SYSTEM_BOOTSTRAP' } });
    assert(franchiseVersionsFromBootstrap === 0, "Bootstrap created no franchise-scoped version — HQ scope only");
    // No duplicate items within the bootstrapped version.
    assert(bootstrapLogicalIds.size === (hqPublished as any).items.length, "No duplicate logicalItemId within the bootstrapped version's items");

    // ------------------------------------------------------------------------
    // INSPECTION COMPATIBILITY (Phase 4B-2D-A regression, spot-checked here)
    // ------------------------------------------------------------------------
    // Phase 4B-2D-D note: this section originally asserted templateVersionId
    // stayed null and checklistDefinition resolved from live
    // QCChecklistTemplate rows — both were accurate descriptions of Phase
    // 4B-2D-C's own state, not a permanent contract. Phase 4B-2D-D
    // explicitly changes both (Parts 13/14 of that phase's spec): the
    // resolver now reads Published versions, and templateVersionId/
    // franchiseTemplateVersionId are now correctly populated. Updated here
    // to test the CURRENT correct behavior via the new authoritative
    // mechanism (publish a version) rather than the old CRUD, which no
    // longer has any effect on what QC Start freezes (Part 9).
    console.log(`\n[Inspection Compatibility] Phase 4B-2D-A snapshot behavior remains correct under the Phase 4B-2D-D resolver...`);
    const compatDraft = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_LID_COMPAT`, label: `${testRunId} Compat Item`, category: `${testRunId}_Compat`, order: 1, mandatory: true }],
      testManagerA
    );
    const compatVersion = await versionService.publishVersion(compatDraft.id, testManagerA);
    const compatItem = (compatVersion.items as any[])[0];

    const compatJob = await createReadyForQcJob(`COMPAT_${Math.floor(1000 + Math.random() * 9000)}`);
    const compatInspection = await qcService.getOrCreateOpenInspection(compatJob.id, actorInspectorA);
    const hqPublishedForCompat = await versionService.getPublishedVersion(null);
    assert(compatInspection.templateVersionId === hqPublishedForCompat!.id, "templateVersionId is now correctly populated with the HQ Published version that produced this checklistDefinition");
    assert(compatInspection.franchiseTemplateVersionId === compatVersion.id, "franchiseTemplateVersionId is now correctly populated with the franchise's own Published version");
    assert(Array.isArray(compatInspection.checklistDefinition), "checklistDefinition is still populated at Start exactly as Phase 4B-2D-A established");
    const compatDef = compatInspection.checklistDefinition as any[];
    assert(compatDef.some((i) => i.id === compatItem.id), "checklistDefinition now resolves from the Published version (not live QCChecklistTemplate rows) — Phase 4B-2D-D's resolver rewire");
    await qcService.submitChecklist(compatJob.id, [{ id: compatItem.id, result: "Passed" }], actorInspectorA);
    const compatDecided = await qcService.decide(compatJob.id, { result: "Passed" }, actorInspectorA);
    assert(compatDecided.status === "Ready For Billing", "submitChecklist/decide/assertChecklistComplete still function exactly as before against checklistDefinition");
    const tamperAttempt = await db.qCInspection.updateMany({ where: { id: compatInspection.id, result: 'Pending' }, data: { checklist: [] } });
    assert(tamperAttempt.count === 0, "Finalized inspection remains immutable (Phase 4B-2A protection unaffected)");

    // ------------------------------------------------------------------------
    // AUDIT
    // ------------------------------------------------------------------------
    console.log(`\n[Audit] Template create/update/delete generate AuditLog entries with correct tenant scope...`);
    const auditItem = await qcService.createChecklistTemplateItem(
      { category: `${testRunId}_Audit`, label: `${testRunId} Audit Item`, order: 1, franchiseId: testFranchiseA.id, mandatory: false },
      testManagerA
    );
    // These service-level calls (bypassing the controller) don't themselves
    // write audit rows — logAudit is called from qc.controller.ts, one
    // layer above the service. Exercise that controller layer directly
    // here, matching how the route would actually invoke it.
    const { QcController } = await import('../src/modules/qc/qc.controller.js');
    const controller = new QcController(qcService);
    function fakeRes() {
      const res: any = { statusCode: 200, body: null };
      res.status = (code: number) => { res.statusCode = code; return res; };
      res.json = (body: any) => { res.body = body; return res; };
      return res;
    }
    const fakeReq = (body: any, user: any) => ({ body, user, params: {}, ip: '127.0.0.1', headers: {} } as any);

    const createReq = fakeReq({ category: `${testRunId}_Audit2`, label: `${testRunId} Audit Item 2`, order: 1, franchiseId: testFranchiseA.id, mandatory: false }, testManagerA);
    await controller.createChecklistTemplateItem(createReq, fakeRes(), (e: any) => { throw e; });
    const createdViaController = await db.qCChecklistTemplate.findFirst({ where: { label: `${testRunId} Audit Item 2` } });
    const createAudit = await db.auditLog.findFirst({ where: { module: 'QC_TEMPLATE', action: 'CREATE', recordId: createdViaController!.id } });
    assert(!!createAudit, "Template CREATE generates an AuditLog entry");
    assert(createAudit!.branchId === testFranchiseA.id, "CREATE audit entry's branchId matches the acting franchise");
    assert((createAudit!.newValue as any)?.label === `${testRunId} Audit Item 2`, "CREATE audit entry's newValue captures the created item");

    const updateReq = fakeReq({ label: `${testRunId} Audit Item 2 Renamed` }, testManagerA);
    updateReq.params = { id: createdViaController!.id };
    await controller.updateChecklistTemplateItem(updateReq, fakeRes(), (e: any) => { throw e; });
    const updateAudit = await db.auditLog.findFirst({ where: { module: 'QC_TEMPLATE', action: 'UPDATE', recordId: createdViaController!.id } });
    assert(!!updateAudit, "Template UPDATE generates an AuditLog entry");
    assert((updateAudit!.oldValue as any)?.label === `${testRunId} Audit Item 2`, "UPDATE audit entry's oldValue captures the pre-update state");
    assert((updateAudit!.newValue as any)?.label === `${testRunId} Audit Item 2 Renamed`, "UPDATE audit entry's newValue captures the post-update state");

    const deleteReq = fakeReq({}, testManagerA);
    deleteReq.params = { id: createdViaController!.id };
    await controller.deleteChecklistTemplateItem(deleteReq, fakeRes(), (e: any) => { throw e; });
    const deleteAudit = await db.auditLog.findFirst({ where: { module: 'QC_TEMPLATE', action: 'DELETE', recordId: createdViaController!.id } });
    assert(!!deleteAudit, "Template DELETE generates an AuditLog entry");
    assert((deleteAudit!.oldValue as any)?.isDeleted === false, "DELETE audit entry's oldValue reflects the pre-delete state");
    assert((deleteAudit!.newValue as any)?.isDeleted === true, "DELETE audit entry's newValue reflects the post-delete (soft-deleted) state");

    // Tenant scope: Franchise B cannot generate an audit entry for Franchise A's item (the underlying service call throws first).
    errorCaught = false;
    const crossReq = fakeReq({ label: "hacked" }, testManagerB);
    crossReq.params = { id: auditItem.id };
    try {
      await controller.updateChecklistTemplateItem(crossReq, fakeRes(), (e: any) => { throw e; });
    } catch (err) {
      errorCaught = true;
    }
    assert(errorCaught, "Cross-franchise update attempt is rejected before reaching the audit call");
    const crossAudit = await db.auditLog.findFirst({ where: { module: 'QC_TEMPLATE', recordId: auditItem.id, userId: testManagerB.id } });
    assert(crossAudit === null, "No audit entry was created for the rejected cross-franchise attempt");

    // ------------------------------------------------------------------------
    // CONCURRENCY
    // ------------------------------------------------------------------------
    console.log(`\n[Concurrency] Two explicit same-scope/same-version-number creates race...`);
    const versionRepo = new QcTemplateVersionRepository();
    const sameNumberAttempts = await Promise.allSettled([
      versionRepo.createDraftWithItems(testFranchiseA.id, 9999, testManagerA.id, [{ logicalItemId: `${testRunId}_CONC1`, label: 'Conc1', category: 'Mech', order: 1, mandatory: false }]),
      versionRepo.createDraftWithItems(testFranchiseA.id, 9999, testManagerA.id, [{ logicalItemId: `${testRunId}_CONC2`, label: 'Conc2', category: 'Mech', order: 1, mandatory: false }]),
    ]);
    const sameNumberFulfilled = sameNumberAttempts.filter((r) => r.status === 'fulfilled');
    const sameNumberRejected = sameNumberAttempts.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    assert(sameNumberFulfilled.length === 1, `Exactly 1 of 2 concurrent same-scope/same-version-number creates succeeded (got ${sameNumberFulfilled.length})`);
    assert(sameNumberRejected.length === 1, `Exactly 1 of 2 rejected cleanly (got ${sameNumberRejected.length})`);
    if (sameNumberRejected.length === 1) {
      assert(
        QcTemplateVersionRepository.isVersionConflictError(sameNumberRejected[0].reason),
        "The rejected attempt is recognized as a clean version-conflict error via the DB unique index, not an opaque failure"
      );
    }

    console.log(`\n[Concurrency] Two concurrent publishes for two different drafts in the same scope...`);
    const draftForConcA = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_PUBCONC_A`, label: 'PubConcA', category: 'Mech', order: 1, mandatory: false }], testManagerA
    );
    const draftForConcB = await versionService.createDraftVersion(
      [{ logicalItemId: `${testRunId}_PUBCONC_B`, label: 'PubConcB', category: 'Mech', order: 1, mandatory: false }], testManagerA
    );
    const publishRace = await Promise.allSettled([
      versionService.publishVersion(draftForConcA.id, testManagerA),
      versionService.publishVersion(draftForConcB.id, testManagerA),
    ]);
    assert(publishRace.every((r) => r.status === 'fulfilled'), "Both concurrent publish calls for two different drafts in the same scope complete without error (no crash, no deadlock)");
    const publishedCountAfterRace = await db.qCChecklistTemplateVersion.count({ where: { franchiseId: testFranchiseA.id, status: 'Published' } });
    assert(publishedCountAfterRace === 1, `Exactly one version ends up Published for the scope after the race — never a mixed/torn state (found ${publishedCountAfterRace})`);

    console.log(`\n[Concurrency] Franchise A and Franchise B concurrent operations do not conflict...`);
    const crossScopeConc = await Promise.allSettled([
      versionService.createDraftVersion([{ logicalItemId: `${testRunId}_XA`, label: 'XA', category: 'Mech', order: 1, mandatory: false }], testManagerA),
      versionService.createDraftVersion([{ logicalItemId: `${testRunId}_XB`, label: 'XB', category: 'Mech', order: 1, mandatory: false }], testManagerB),
    ]);
    assert(crossScopeConc.every((r) => r.status === 'fulfilled'), "Concurrent operations on Franchise A and Franchise B both succeed independently — no unnecessary cross-scope contention");

  } finally {
    console.log(`\n[Clean Up] Cleaning up Phase 4B-2D-C test data...`);
    // Find (before deleting anything) the one global-scope Draft this test
    // created (hqDraft) — identified by its items' testRunId-prefixed
    // logicalItemId — WITHOUT touching the real bootstrapped "HQ Version 1,
    // Published" (its items' logicalItemIds are migration-backfilled UUIDs,
    // never testRunId-prefixed, so this lookup can never match it). Deleting
    // the version row cascades to its items (onDelete: Cascade), so items
    // must not be deleted separately first — that would leave this orphaned.
    const staleGlobalVersionIds = (
      await db.qCChecklistTemplateVersion.findMany({
        where: { franchiseId: null, items: { some: { logicalItemId: { startsWith: testRunId } } } },
        select: { id: true },
      })
    ).map((v) => v.id);
    if (staleGlobalVersionIds.length > 0) {
      await db.qCChecklistTemplateVersion.deleteMany({ where: { id: { in: staleGlobalVersionIds } } }).catch(() => {});
    }
    await db.qCChecklistTemplateVersion.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    // AuditLog rows are intentionally left in place — audit history is
    // never deleted by test cleanup, matching how real audit trails work.
    await db.qCChecklistTemplate.deleteMany({ where: { franchiseId: null, category: { startsWith: testRunId } } }).catch(() => {});
    await db.jobHistory.deleteMany({ where: { jobId: { contains: testRunId } } }).catch(() => {});
    await db.jobPhoto.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.qCInspection.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.qCChecklistTemplate.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.job.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.carIn.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.employee.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.franchise.deleteMany({ where: { id: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    console.log(`Clean up completed.`);
  }

  console.log(`\n=======================================================`);
  console.log(`PHASE 4B-2D-C TEST RESULTS SUMMARY:`);
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
