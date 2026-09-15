// Phase 4B-2D-A — start-time QC checklist snapshot/freeze. Verifies that the
// effective checklist DEFINITION (id/label/category/order/mandatory) is
// resolved and frozen onto QCInspection.checklistDefinition at Start, and
// that submitChecklist/decide validate against that frozen definition
// rather than re-resolving the live/current effective checklist. QCInspection
// .checklist itself (Phase 4B-2C) keeps its pre-existing contract unchanged:
// it holds only the items actually submitted so far, replaced wholesale on
// every submitChecklist call (see qc.service.ts's submitChecklist comment,
// and the Phase 4B-1 test suite's own assertion on that exact contract).
// Directly reproduces the two HIGH-severity findings from the Phase 4B-2D
// discovery (see "High-Risk Regression" section below).
//
// Phase 4B-2D-D — FIXTURE MECHANISM UPDATED. Since buildFrozenChecklist now
// resolves through QcTemplateVersionRepository.resolveEffectiveChecklist
// (published template VERSIONS) instead of live QCChecklistTemplate rows
// (Part 9's explicit requirement: "QC START must no longer derive its
// effective checklist from mutable live template rows"), every scenario
// below that used to mutate a QCChecklistTemplate row directly now instead
// publishes a NEW version that supersedes the previous one — that is the
// only way a change becomes "live" under the new architecture. Every
// original assertion's INTENT (what Phase 4B-2D-A actually protects) is
// unchanged; only the mechanism for "what is currently effective" moved.
import { db } from '../src/lib/db.js';
import { JobCardService } from '../src/modules/job-card/service/job-card.service.js';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { QcService } from '../src/modules/qc/qc.service.js';
import { QcRepository } from '../src/modules/qc/qc.repository.js';
import { QcTemplateVersionService } from '../src/modules/qc/qc-template-version.service.js';
import type { VersionItemInput } from '../src/modules/qc/qc-template-version.repository.js';

const testRunId = `P4B2D_${Date.now()}`;
console.log(`=======================================================`);
console.log(`STARTING PHASE 4B-2D-A SNAPSHOT/FREEZE TESTS`);
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

async function runTests() {
  const jobService = new JobCardService();
  const checkinService = new VehicleCheckinService();
  const qcService = new QcService();
  const qcRepository = new QcRepository();
  const versionService = new QcTemplateVersionService();

  const testFranchiseA = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_A`, name: "Phase 4B-2D-A Test Branch A", city: "Chennai", owner: "Tester A",
      phone: "9311111111", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });
  const testFranchiseB = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_B`, name: "Phase 4B-2D-A Test Branch B", city: "Bangalore", owner: "Tester B",
      phone: "9322222222", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });

  const testTechA = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_TECHA`, name: `Tech Alpha ${testRunId}`, role: "TECHNICIAN",
      phone: "9311110001", email: `techa_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Active",
    },
  });
  const testInspectorA = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_QIA`, name: `QI Alpha ${testRunId}`, role: "QUALITY_INSPECTOR",
      phone: "9311110002", email: `qia_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Active",
    },
  });

  const testManagerA = { id: `${testRunId}_MGR_A`, name: "Manager Alpha", role: "BRANCH_MANAGER", franchiseId: testFranchiseA.id };
  const testManagerB = { id: `${testRunId}_MGR_B`, name: "Manager Beta", role: "BRANCH_MANAGER", franchiseId: testFranchiseB.id };
  const testHqUser = { id: `${testRunId}_HQ`, name: "HQ Admin", role: "SUPER_ADMIN", franchiseId: null };
  const actorInspectorA = { id: testInspectorA.id, name: testInspectorA.name, role: "QUALITY_INSPECTOR", franchiseId: testFranchiseA.id };
  const actorTechA = { id: testTechA.id, name: testTechA.name, role: "TECHNICIAN", franchiseId: testFranchiseA.id };

  // Publishes a brand-new version (superseding whatever was previously
  // Published for that actor's scope) in one call — the version model is
  // whole-template, so every call must pass the COMPLETE desired item set
  // for that scope, not an incremental diff.
  async function publishNewVersion(items: VersionItemInput[], actor: any) {
    const draft = await versionService.createDraftVersion(items, actor);
    return versionService.publishVersion(draft.id, actor);
  }

  // ─── Initial published state — effective before any of the scenario jobs Start ───
  const MANDATORY_LABEL = `${testRunId} Brake`;
  const OPTIONAL_LABEL = `${testRunId} Wash`;
  const OPTIONAL2_LABEL = `${testRunId} Interior`;
  const BONLY_LABEL = `${testRunId} B Item`;
  const MECH_CATEGORY = `${testRunId}_Mech`;

  // IMPORTANT: never create/publish a new HQ-scope (franchiseId: null)
  // version in this test file. HQ is ONE shared, permanent scope (not a
  // disposable per-run fixture like the test franchises below) — the
  // "at most one Published version per scope" invariant (Phase 4B-2D-C)
  // means publishing a test HQ version would permanently Supersede the
  // real bootstrapped "HQ Version 1" with no way to un-Supersede it
  // afterward, even if the test's own version is deleted in cleanup. Use
  // the REAL, already-published HQ version as "the HQ layer" instead.
  const hqV1 = await versionService.getPublishedVersion(null);
  assert(hqV1 !== null, "Sanity check: HQ scope already has a Published version (from the Phase 4B-2D-C bootstrap) before this test creates anything");

  const franchiseAV1 = await publishNewVersion(
    [
      { logicalItemId: `${testRunId}_LID_MAND`, label: MANDATORY_LABEL, category: MECH_CATEGORY, order: 1, mandatory: true },
      { logicalItemId: `${testRunId}_LID_OPT`, label: OPTIONAL_LABEL, category: MECH_CATEGORY, order: 2, mandatory: false },
      { logicalItemId: `${testRunId}_LID_OPT2`, label: OPTIONAL2_LABEL, category: MECH_CATEGORY, order: 3, mandatory: false },
    ],
    testManagerA
  );
  await publishNewVersion(
    [{ logicalItemId: `${testRunId}_LID_BONLY`, label: BONLY_LABEL, category: MECH_CATEGORY, order: 1, mandatory: false }],
    testManagerB
  );
  const hqSampleItem = (hqV1!.items as any[])[0];
  const expectedFrozenIds = [...(hqV1!.items as any[]), ...(franchiseAV1.items as any[])].map((i: any) => i.id).sort();

  async function createReadyForQcJob(vehicleSuffix: string) {
    const checkin = await checkinService.createCheckin({
      vehicle: `TN 04 P4B2D ${vehicleSuffix}`, model: "Honda City", customer: "QC Test Customer",
      phone: "9876500000", service: "Full Service", inTime: new Date().toISOString(), odometer: "45000", status: "Pending",
    }, testFranchiseA.id);
    await db.carIn.update({
      where: { id: checkin.id },
      data: { scratches: "Minor scratch on rear bumper", photoFront: "https://cdn.shifterz.com/photos/front.jpg" },
    });
    await jobService.updateJob(checkin.jobCardId!, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    return jobService.requestCompletion(checkin.jobCardId!, actorTechA);
  }

  // The frozen DEFINITION (checklistDefinition) — what exists and is
  // mandatory for this attempt. Never contains result/remark.
  async function getFrozenDefinition(jobId: string): Promise<any[]> {
    const inspection = await db.qCInspection.findFirst({ where: { jobId }, orderBy: { attemptNumber: 'desc' } });
    return Array.isArray(inspection?.checklistDefinition) ? (inspection!.checklistDefinition as any[]) : [];
  }

  // The submitted-results-only checklist (Phase 4B-2C contract, unchanged).
  async function getSubmittedChecklist(jobId: string): Promise<any[]> {
    const inspection = await db.qCInspection.findFirst({ where: { jobId }, orderBy: { attemptNumber: 'desc' } });
    return Array.isArray(inspection?.checklist) ? (inspection!.checklist as any[]) : [];
  }

  try {
    // ------------------------------------------------------------------------
    // START
    // ------------------------------------------------------------------------
    console.log(`\n[Start] Tests 1-3 — Start freezes the effective checklist definition...`);
    const jobStart = await createReadyForQcJob(`START_${Math.floor(1000 + Math.random() * 9000)}`);
    const startedInspection = await qcService.getOrCreateOpenInspection(jobStart.id, actorInspectorA);
    // The HQ Published version's real 18 bootstrapped items are legitimately
    // part of the effective checklist (global scope) — expectedFrozenIds
    // already includes them (built from hqV1!.items above), so this
    // compares the FULL frozen set, not just this test run's own items.
    const frozenDefAtStartFull = Array.isArray(startedInspection.checklistDefinition) ? (startedInspection.checklistDefinition as any[]) : [];
    const frozenDefAtStart = frozenDefAtStartFull; // alias kept for the rest of this section's readability
    const frozenIds = frozenDefAtStartFull.map((i) => i.id).sort();
    assert(JSON.stringify(frozenIds) === JSON.stringify(expectedFrozenIds), "Test 1: Start freezes exactly this run's effective (HQ Published + own-franchise Published) checklist definition items");

    const frozenMandatory = frozenDefAtStart.find((i) => i.label === MANDATORY_LABEL);
    const frozenOptional = frozenDefAtStart.find((i) => i.label === OPTIONAL_LABEL);
    const frozenGlobal = frozenDefAtStart.find((i) => i.id === hqSampleItem.id);
    assert(
      frozenMandatory?.label === MANDATORY_LABEL && frozenMandatory?.category === MECH_CATEGORY &&
      typeof frozenMandatory?.order === 'number' && frozenMandatory?.mandatory === true,
      "Test 2: Frozen definition item carries label/category/order/mandatory"
    );
    assert(frozenOptional?.mandatory === false && frozenGlobal?.mandatory === hqSampleItem.mandatory, "Test 2b: HQ item's mandatory state is frozen correctly too");

    const checklistAtStart = Array.isArray(startedInspection.checklist) ? (startedInspection.checklist as any[]) : null;
    assert(
      checklistAtStart === null || checklistAtStart.length === 0,
      "Test 3: Nothing is answered at Start — QCInspection.checklist starts empty (an item never submitted is equivalent to Unanswered), not fabricated as Passed for any item"
    );

    // ------------------------------------------------------------------------
    // TEMPLATE CHANGE PROTECTION (Tests 4-8) + SUBMIT (Tests 9-13) + DECISION (14, 16)
    // — chained against a single inspection, since each scenario publishes a
    // new version and then re-checks that THIS inspection's already-frozen
    // definition is untouched.
    // ------------------------------------------------------------------------
    console.log(`\n[Template Changes] Tests 4-8 — publishing new versions after Start does not affect the open inspection's frozen definition...`);
    const jobScenarios = await createReadyForQcJob(`SCEN_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(jobScenarios.id, actorInspectorA);
    const frozenDefSnapshot = await getFrozenDefinition(jobScenarios.id);
    // Ids valid for THIS inspection, resolved once from its own frozen
    // snapshot — every republish below assigns brand-new version-item row
    // ids to "the same conceptual item," so submissions/decisions against
    // this inspection must keep using these original ids, never whatever a
    // later republish's item id happens to be.
    const frozenGlobalItem = frozenDefSnapshot.find((i) => i.id === hqSampleItem.id);
    const frozenMandatoryItem = frozenDefSnapshot.find((i) => i.label === MANDATORY_LABEL);
    const frozenOptionalItem = frozenDefSnapshot.find((i) => i.label === OPTIONAL_LABEL);
    const frozenOptional2Item = frozenDefSnapshot.find((i) => i.label === OPTIONAL2_LABEL);

    // Scenario A — Franchise A publishes a new version adding an item.
    const franchiseAV2 = await publishNewVersion(
      [
        { logicalItemId: `${testRunId}_LID_MAND`, label: MANDATORY_LABEL, category: MECH_CATEGORY, order: 1, mandatory: true },
        { logicalItemId: `${testRunId}_LID_OPT`, label: OPTIONAL_LABEL, category: MECH_CATEGORY, order: 2, mandatory: false },
        { logicalItemId: `${testRunId}_LID_OPT2`, label: OPTIONAL2_LABEL, category: MECH_CATEGORY, order: 3, mandatory: false },
        { logicalItemId: `${testRunId}_LID_D`, label: `${testRunId} D New`, category: MECH_CATEGORY, order: 4, mandatory: false },
      ],
      testManagerA
    );
    const newItemD = (franchiseAV2.items as any[]).find((i) => i.label === `${testRunId} D New`);
    let afterMutation = await getFrozenDefinition(jobScenarios.id);
    assert(JSON.stringify(afterMutation) === JSON.stringify(frozenDefSnapshot), "Test 4: Publishing a new version with an added item leaves the open inspection's frozen definition byte-identical");
    assert(!afterMutation.some((i) => i.id === newItemD.id), "Test 4b: The new item does not appear in the already-frozen definition");

    // Scenario B — Franchise A publishes a version that OMITS an item that was frozen.
    const franchiseAV3 = await publishNewVersion(
      [
        { logicalItemId: `${testRunId}_LID_MAND`, label: MANDATORY_LABEL, category: MECH_CATEGORY, order: 1, mandatory: true },
        { logicalItemId: `${testRunId}_LID_OPT2`, label: OPTIONAL2_LABEL, category: MECH_CATEGORY, order: 3, mandatory: false },
        { logicalItemId: `${testRunId}_LID_D`, label: `${testRunId} D New`, category: MECH_CATEGORY, order: 4, mandatory: false },
      ],
      testManagerA
    );
    afterMutation = await getFrozenDefinition(jobScenarios.id);
    assert(JSON.stringify(afterMutation) === JSON.stringify(frozenDefSnapshot), "Test 5: A republish that omits a frozen item leaves the open inspection's frozen definition byte-identical");
    assert(afterMutation.some((i) => i.id === frozenOptionalItem.id), "Test 5b: The now-omitted-live item is still present in the frozen definition");

    // Scenario C — Franchise A republishes with the mandatory item renamed.
    await publishNewVersion(
      [
        { logicalItemId: `${testRunId}_LID_MAND`, label: `${MANDATORY_LABEL} RENAMED`, category: MECH_CATEGORY, order: 1, mandatory: true },
        { logicalItemId: `${testRunId}_LID_OPT2`, label: OPTIONAL2_LABEL, category: MECH_CATEGORY, order: 3, mandatory: false },
        { logicalItemId: `${testRunId}_LID_D`, label: `${testRunId} D New`, category: MECH_CATEGORY, order: 4, mandatory: false },
      ],
      testManagerA
    );
    afterMutation = await getFrozenDefinition(jobScenarios.id);
    const renamedFrozenEntry = afterMutation.find((i) => i.id === frozenMandatoryItem.id);
    assert(renamedFrozenEntry?.label === MANDATORY_LABEL, "Test 6: Republishing with a renamed item does not change the frozen inspection's stored definition label");

    // Scenario D — mandatory flips both directions on republish.
    await publishNewVersion(
      [
        { logicalItemId: `${testRunId}_LID_MAND`, label: MANDATORY_LABEL, category: MECH_CATEGORY, order: 1, mandatory: false }, // was true at Start
        { logicalItemId: `${testRunId}_LID_OPT2`, label: OPTIONAL2_LABEL, category: MECH_CATEGORY, order: 3, mandatory: true }, // was false at Start
        { logicalItemId: `${testRunId}_LID_D`, label: `${testRunId} D New`, category: MECH_CATEGORY, order: 4, mandatory: false },
      ],
      testManagerA
    );
    afterMutation = await getFrozenDefinition(jobScenarios.id);
    assert(afterMutation.find((i) => i.id === frozenMandatoryItem.id)?.mandatory === true, "Test 7a: Item mandatory=true at Start remains mandatory after a republish flips it to optional");
    assert(afterMutation.find((i) => i.id === frozenOptional2Item.id)?.mandatory === false, "Test 7b: Item mandatory=false at Start remains optional after a republish flips it to mandatory");

    // Scenario E — franchise-owned item changes (Franchise B's own scope; irrelevant to Franchise A's job either way).
    const franchiseBItemBefore = await getFrozenDefinition(jobScenarios.id); // unchanged baseline reference
    await publishNewVersion(
      [{ logicalItemId: `${testRunId}_LID_BONLY`, label: `${BONLY_LABEL} RENAMED`, category: MECH_CATEGORY, order: 1, mandatory: true }],
      testManagerB
    );
    afterMutation = await getFrozenDefinition(jobScenarios.id);
    assert(JSON.stringify(afterMutation) === JSON.stringify(franchiseBItemBefore), "Test 8: A franchise's own republish (even to another franchise's item) leaves this inspection's frozen definition byte-identical");
    assert(!afterMutation.some((i) => i.label.startsWith(BONLY_LABEL)), "Test 8b: Franchise B's item was never in Franchise A's frozen definition to begin with");

    console.log(`\n[Submit] Tests 9-13 — submission validates against the frozen definition, not the live/current effective checklist...`);
    // Test 9/10: the now-omitted-from-latest-publish item is still a valid id for this attempt.
    const submitResult = await qcService.submitChecklist(jobScenarios.id, [
      { id: frozenGlobalItem.id, result: "Passed" },
      { id: frozenOptionalItem.id, result: "Passed" }, // omitted from the latest Franchise A publish, still valid here
    ], actorInspectorA);
    assert(submitResult !== null, "Test 9/10: Submitting against frozen ids (including one no longer in the latest published version) succeeds");
    const postSubmitChecklist = await getSubmittedChecklist(jobScenarios.id);
    assert(postSubmitChecklist.find((i) => i.id === frozenOptionalItem.id)?.result === "Passed", "Test 10b: The no-longer-current item's result was actually recorded");
    assert(
      postSubmitChecklist.length === 2 && !postSubmitChecklist.some((i) => i.id === frozenMandatoryItem.id),
      "Test 10c: QCInspection.checklist holds only what was actually submitted (Phase 4B-2C's pre-existing replace contract) — the mandatory item, not named in this submission, is simply absent, not defaulted to any result"
    );

    // Test 11: an item from the LATEST published version that was never part of THIS inspection's frozen set is rejected.
    let errorCaught = false;
    try {
      await qcService.submitChecklist(jobScenarios.id, [{ id: newItemD.id, result: "Passed" }], actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not in the configured template"), "Test 11: An id from a later publish (never in this attempt's own frozen set) is rejected with the standard unknown-id message");
    }
    assert(errorCaught, "Test 11b: Submitting an id introduced by a later publish for this attempt is rejected");

    // Test 12: duplicate IDs.
    errorCaught = false;
    try {
      await qcService.submitChecklist(jobScenarios.id, [
        { id: frozenGlobalItem.id, result: "Passed" },
        { id: frozenGlobalItem.id, result: "Failed", remark: "conflict" },
      ], actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("duplicate"), "Test 12: Duplicate submitted ID still rejected");
    }
    assert(errorCaught, "Test 12b: Duplicate id rejection preserved under frozen-definition validation");

    // Test 13: a truly unknown id (never existed anywhere).
    errorCaught = false;
    try {
      await qcService.submitChecklist(jobScenarios.id, [{ id: `${testRunId}_NEVER_EXISTED`, result: "Passed" }], actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
    }
    assert(errorCaught, "Test 13: A wholly unknown id is still rejected");

    console.log(`\n[Decision] Tests 14, 16 — mandatory completeness evaluated from the frozen definition...`);
    // frozenMandatoryItem is frozen mandatory=true (even though the latest publish flipped it to false) — must answer it.
    // frozenOptional2Item is frozen mandatory=false (even though the latest publish flipped it to true) — leaving it Unanswered must be fine.
    await qcService.submitChecklist(jobScenarios.id, [
      { id: frozenGlobalItem.id, result: "Passed" },
      { id: frozenOptionalItem.id, result: "Passed" },
      { id: frozenMandatoryItem.id, result: "Passed" },
    ], actorInspectorA);
    const decidedScenarios = await qcService.decide(jobScenarios.id, { result: "Passed" }, actorInspectorA);
    assert(decidedScenarios.status === "Ready For Billing", "Test 14/16: Decision succeeds once the FROZEN-mandatory item is answered, regardless of any mandatory flips published since Start, and without needing the frozen-optional item answered at all");

    // ------------------------------------------------------------------------
    // HIGH-RISK REGRESSION — Test A (Phase 4B-2D discovery, finding #1)
    // ------------------------------------------------------------------------
    console.log(`\n[High-Risk Test A] A new mandatory item published after Start → does NOT block decision...`);
    const jobA = await createReadyForQcJob(`HRA_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(jobA.id, actorInspectorA);
    const frozenDefA = await getFrozenDefinition(jobA.id);
    // Answer every item that was ACTUALLY frozen at Start.
    await qcService.submitChecklist(
      jobA.id,
      frozenDefA.map((i) => ({ id: i.id, result: "Passed" as const })),
      actorInspectorA
    );
    // Franchise A publishes a version adding a brand-new MANDATORY item after this inspection already started.
    await publishNewVersion(
      [
        { logicalItemId: `${testRunId}_LID_MAND`, label: MANDATORY_LABEL, category: MECH_CATEGORY, order: 1, mandatory: true },
        { logicalItemId: `${testRunId}_LID_OPT2`, label: OPTIONAL2_LABEL, category: MECH_CATEGORY, order: 3, mandatory: true },
        { logicalItemId: `${testRunId}_LID_D`, label: `${testRunId} D New`, category: MECH_CATEGORY, order: 4, mandatory: false },
        { logicalItemId: `${testRunId}_LID_HRA`, label: `${testRunId} HighRiskA New Mandatory`, category: MECH_CATEGORY, order: 9, mandatory: true },
      ],
      testManagerA
    );
    const decidedA = await qcService.decide(jobA.id, { result: "Passed" }, actorInspectorA);
    assert(decidedA.status === "Ready For Billing", "Test A: A new mandatory item published after Start does NOT block this inspection's decision");

    // ------------------------------------------------------------------------
    // HIGH-RISK REGRESSION — Test B (Phase 4B-2D discovery, finding #2)
    // ------------------------------------------------------------------------
    console.log(`\n[High-Risk Test B] A frozen item omitted from a later publish → checklist can still be saved again...`);
    const jobB = await createReadyForQcJob(`HRB_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(jobB.id, actorInspectorA);
    const frozenDefB = await getFrozenDefinition(jobB.id);
    await qcService.submitChecklist(jobB.id, [{ id: frozenDefB[0].id, result: "Passed" }], actorInspectorA);
    // Franchise A republishes WITHOUT one of the frozen items (pick the last;
    // frozenDefB is Franchise A's effective definition, so this is always an
    // HQ-global or Franchise-A-owned item, never Franchise B's).
    const omittedLiveItem = frozenDefB[frozenDefB.length - 1];
    await publishNewVersion(
      [{ logicalItemId: `${testRunId}_LID_HRB_KEEP`, label: `${testRunId} HRB Keep`, category: MECH_CATEGORY, order: 1, mandatory: false }],
      testManagerA
    );
    // Inspector saves again, referencing the now-omitted item — must succeed, not hard-reject the whole submission.
    const secondSave = await qcService.submitChecklist(jobB.id, [
      { id: frozenDefB[0].id, result: "Passed" },
      { id: omittedLiveItem.id, result: "Passed" },
    ], actorInspectorA);
    assert(secondSave !== null, "Test B: Saving the checklist again after a republish omits one of its frozen items succeeds, not rejected");

    // ------------------------------------------------------------------------
    // MULTI-ATTEMPT (Tests 17-20)
    // ------------------------------------------------------------------------
    console.log(`\n[Multi-Attempt] Tests 17-20 — each attempt freezes its own definition independently at its own Start...`);
    const jobMulti = await createReadyForQcJob(`MULTI_${Math.floor(1000 + Math.random() * 9000)}`);
    const attempt1 = await qcService.getOrCreateOpenInspection(jobMulti.id, actorInspectorA);
    const attempt1Frozen = Array.isArray(attempt1.checklistDefinition) ? (attempt1.checklistDefinition as any[]) : [];
    assert(attempt1Frozen.some((i) => i.label === `${testRunId} HRB Keep`), "Test 17 setup: Attempt 1 freezes the definition as it exists at ITS OWN Start (includes items published earlier in this run)");

    // Answer every item Attempt 1 actually froze, then fail it so a rework
    // re-entry (attempt 2) becomes possible.
    await qcService.submitChecklist(
      jobMulti.id,
      attempt1Frozen.map((i) => ({ id: i.id, result: "Passed" as const })),
      actorInspectorA
    );
    await qcService.decide(jobMulti.id, { result: "Failed", reason: "rework needed" }, actorInspectorA);

    // A new version publishes between Attempt 1 and Attempt 2 — an item that
    // did NOT exist yet when Attempt 1 froze its definition.
    const attempt2OnlyLabel = `${testRunId} Attempt2Only`;
    const franchiseAForAttempt2 = await publishNewVersion(
      [{ logicalItemId: `${testRunId}_LID_ATT2`, label: attempt2OnlyLabel, category: MECH_CATEGORY, order: 1, mandatory: false }],
      testManagerA
    );
    const attempt2OnlyItem = (franchiseAForAttempt2.items as any[]).find((i) => i.label === attempt2OnlyLabel);
    assert(!attempt1Frozen.some((i) => i.id === attempt2OnlyItem.id), "Test 17: Attempt 1's already-frozen definition does not include an item published after ITS OWN Start");

    const attempt2 = await qcService.getOrCreateOpenInspection(jobMulti.id, actorInspectorA);
    assert(attempt2.attemptNumber === attempt1.attemptNumber + 1, "Test 18 setup: Attempt 2 is a genuinely new attempt");
    const attempt2Frozen = Array.isArray(attempt2.checklistDefinition) ? (attempt2.checklistDefinition as any[]) : [];
    assert(attempt2Frozen.some((i) => i.id === attempt2OnlyItem.id), "Test 19: Attempt 2 freezes the definition as it exists at ITS OWN Start, including the item published after Attempt 1");

    const attempt1AfterAll = await db.qCInspection.findUnique({ where: { id: attempt1.id } });
    const attempt1FrozenAfterAll = Array.isArray(attempt1AfterAll?.checklistDefinition) ? (attempt1AfterAll!.checklistDefinition as any[]) : [];
    assert(
      !attempt1FrozenAfterAll.some((i) => i.id === attempt2OnlyItem.id),
      "Test 20: Attempt 1's own stored frozen definition remains exactly what it was frozen with — unaffected by Attempt 2's later freeze or the new publish"
    );

    // ------------------------------------------------------------------------
    // FINALIZATION (Test 21)
    // ------------------------------------------------------------------------
    console.log(`\n[Finalization] Test 21 — finalized inspection's frozen checklist remains immutable...`);
    const checklistBeforeTamper = attempt1AfterAll?.checklist;
    const tamperResult = await qcRepository.updateInspection(attempt1.id, { checklist: [{ id: "tampered", result: "Passed" }] });
    assert(tamperResult === null, "Test 21: updateInspection rejects a write against the finalized (Failed) attempt 1");
    const attempt1Final = await db.qCInspection.findUnique({ where: { id: attempt1.id } });
    assert(JSON.stringify(attempt1Final?.checklist) === JSON.stringify(checklistBeforeTamper), "Test 21b: Finalized checklist snapshot unchanged after the rejected write attempt");

    // ------------------------------------------------------------------------
    // TENANT ISOLATION (Test 22)
    // ------------------------------------------------------------------------
    console.log(`\n[Tenant] Test 22 — frozen definition contains only HQ + own-franchise items...`);
    assert(
      !frozenDefAtStart.some((i) => i.label.startsWith(BONLY_LABEL)),
      "Test 22: A Franchise-A job's frozen definition never includes Franchise B's own item"
    );
    assert(
      frozenDefAtStart.some((i) => i.id === hqSampleItem.id) && frozenDefAtStart.some((i) => i.label === MANDATORY_LABEL),
      "Test 22b: The frozen definition DOES include both the HQ item and Franchise A's own item"
    );

  } finally {
    console.log(`\n[Clean Up] Cleaning up Phase 4B-2D-A test data...`);
    await db.jobHistory.deleteMany({ where: { jobId: { contains: testRunId } } }).catch(() => {});
    await db.jobPhoto.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.qCInspection.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    // No global (franchiseId: null) QCChecklistTemplateVersion cleanup here —
    // deliberately: this test never creates one (see the setup comment on
    // hqV1 above), so there is nothing of this test's own to remove, and
    // touching the real shared HQ version history here would be exactly the
    // mistake that caused it to be permanently mis-Superseded once already.
    await db.qCChecklistTemplateVersion.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.job.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.carIn.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.employee.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.franchise.deleteMany({ where: { id: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    console.log(`Clean up completed.`);
  }

  console.log(`\n=======================================================`);
  console.log(`PHASE 4B-2D-A TEST RESULTS SUMMARY:`);
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
