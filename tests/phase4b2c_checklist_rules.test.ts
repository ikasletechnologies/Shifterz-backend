// Phase 4B-2C — checklist mandatory/completeness rules, three-state results
// (Unanswered/Passed/Failed), failed-item remark requirement, duplicate-ID
// protection, and deterministic template ordering.
import { db } from '../src/lib/db.js';
import { JobCardService } from '../src/modules/job-card/service/job-card.service.js';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { QcService } from '../src/modules/qc/qc.service.js';
import { QcRepository } from '../src/modules/qc/qc.repository.js';
import { QcTemplateVersionService } from '../src/modules/qc/qc-template-version.service.js';

const testRunId = `P4B2C_${Date.now()}`;
console.log(`=======================================================`);
console.log(`STARTING PHASE 4B-2C CHECKLIST RULES TESTS`);
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
      id: `${testRunId}_FRAN_A`, name: "Phase 4B-2C Test Branch A", city: "Chennai", owner: "Tester A",
      phone: "9111111111", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });
  const testFranchiseB = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_B`, name: "Phase 4B-2C Test Branch B", city: "Bangalore", owner: "Tester B",
      phone: "9222222222", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });

  const testTechA = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_TECHA`, name: `Tech Alpha ${testRunId}`, role: "TECHNICIAN",
      phone: "9111110001", email: `techa_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Active",
    },
  });
  const testInspectorA = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_QIA`, name: `QI Alpha ${testRunId}`, role: "QUALITY_INSPECTOR",
      phone: "9111110002", email: `qia_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Active",
    },
  });

  const testManagerA = { id: `${testRunId}_MGR_A`, name: "Manager Alpha", role: "BRANCH_MANAGER", franchiseId: testFranchiseA.id };
  const testManagerB = { id: `${testRunId}_MGR_B`, name: "Manager Beta", role: "BRANCH_MANAGER", franchiseId: testFranchiseB.id };
  const actorInspectorA = { id: testInspectorA.id, name: testInspectorA.name, role: "QUALITY_INSPECTOR", franchiseId: testFranchiseA.id };
  const actorTechA = { id: testTechA.id, name: testTechA.name, role: "TECHNICIAN", franchiseId: testFranchiseA.id };
  const testHqUser = { id: `${testRunId}_HQ`, name: "HQ Admin", role: "SUPER_ADMIN", franchiseId: null };

  // Phase 4B-2D-D note: submitChecklist now validates against the frozen
  // checklistDefinition, which resolves from published template VERSIONS
  // (QcTemplateVersionRepository.resolveEffectiveChecklist), not live
  // QCChecklistTemplate rows anymore (Part 9 of that phase's spec) — so
  // these fixture items must be published as a version, not merely created
  // via the old CRUD, or no submitChecklist call below could ever reference
  // them. The old CRUD (qcService.createChecklistTemplateItem, used later
  // in the Ordering/Concurrency sections) still exists and still works on
  // its own terms — it just no longer feeds QC Start.
  const draftA = await versionService.createDraftVersion(
    [
      { logicalItemId: `${testRunId}_LID_MAND`, label: `${testRunId} Brakes`, category: "Exterior", order: 1, mandatory: true },
      { logicalItemId: `${testRunId}_LID_OPT`, label: `${testRunId} Wash`, category: "Interior", order: 1, mandatory: false },
    ],
    testManagerA
  );
  const franchiseAVersion = await versionService.publishVersion(draftA.id, testManagerA);
  const mandatoryItem = (franchiseAVersion.items as any[]).find((i) => i.label === `${testRunId} Brakes`);
  const optionalItem = (franchiseAVersion.items as any[]).find((i) => i.label === `${testRunId} Wash`);

  const draftB = await versionService.createDraftVersion(
    [{ logicalItemId: `${testRunId}_LID_BONLY`, label: `${testRunId} B-only item`, category: "Exterior", order: 1, mandatory: false }],
    testManagerB
  );
  const franchiseBVersion = await versionService.publishVersion(draftB.id, testManagerB);
  const franchiseBItem = (franchiseBVersion.items as any[])[0];

  async function createReadyForQcJob(vehicleSuffix: string) {
    const checkin = await checkinService.createCheckin({
      vehicle: `TN 04 P4B2C ${vehicleSuffix}`, model: "Honda City", customer: "QC Test Customer",
      phone: "9876500000", service: "Full Service", inTime: new Date().toISOString(), odometer: "45000", status: "Pending",
    }, testFranchiseA.id);
    await db.carIn.update({
      where: { id: checkin.id },
      data: { scratches: "Minor scratch on rear bumper", photoFront: "https://cdn.shifterz.com/photos/front.jpg" },
    });
    await jobService.updateJob(checkin.jobCardId!, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    return jobService.requestCompletion(checkin.jobCardId!, actorTechA);
  }

  try {
    // ------------------------------------------------------------------------
    // MANDATORY / COMPLETENESS
    // ------------------------------------------------------------------------
    console.log(`\n[Mandatory] Test 1 — mandatory item Passed → Pass accepted...`);
    const job1 = await createReadyForQcJob(`M1_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job1.id, actorInspectorA);
    await qcService.submitChecklist(job1.id, [
      { id: mandatoryItem.id, result: "Passed" },
      { id: optionalItem.id, result: "Unanswered" },
    ], actorInspectorA);
    const passedJob1 = await qcService.decide(job1.id, { result: "Passed" }, actorInspectorA);
    assert(passedJob1.status === "Ready For Billing", "Mandatory item Passed + optional Unanswered → Pass succeeds");

    console.log(`\n[Mandatory] Test 2 — mandatory item Failed with remark → Fail accepted...`);
    const job2 = await createReadyForQcJob(`M2_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job2.id, actorInspectorA);
    await qcService.submitChecklist(job2.id, [
      { id: mandatoryItem.id, result: "Failed", remark: "Brake pads worn" },
    ], actorInspectorA);
    const failedJob2 = await qcService.decide(job2.id, { result: "Failed", reason: "Brake issue" }, actorInspectorA);
    assert(failedJob2.status === "Rework Required", "Mandatory item Failed (with remark) → Fail succeeds");

    console.log(`\n[Mandatory] Test 3 — mandatory item unanswered → rejected at decision boundary...`);
    const job3 = await createReadyForQcJob(`M3_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job3.id, actorInspectorA);
    await qcService.submitChecklist(job3.id, [
      { id: optionalItem.id, result: "Passed" },
    ], actorInspectorA);
    let errorCaught = false;
    try {
      await qcService.decide(job3.id, { result: "Passed" }, actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("incomplete") && err.message.includes("mandatory"), "Rejection message identifies incomplete mandatory items");
    }
    assert(errorCaught, "Mandatory item unanswered (never submitted) blocks the decision");
    const job3AfterFailedDecide = await db.job.findUnique({ where: { id: job3.id } });
    assert(job3AfterFailedDecide?.status === "Waiting for Quality Check", "Job status unchanged after the rejected decision attempt");

    // Submitting the mandatory item explicitly as Unanswered must behave identically to omitting it.
    await qcService.submitChecklist(job3.id, [
      { id: mandatoryItem.id, result: "Unanswered" },
      { id: optionalItem.id, result: "Passed" },
    ], actorInspectorA);
    errorCaught = false;
    try {
      await qcService.decide(job3.id, { result: "Passed" }, actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
    }
    assert(errorCaught, "Explicit result:'Unanswered' on a mandatory item also blocks the decision");

    console.log(`\n[Mandatory] Test 4 — optional item unanswered → accepted...`);
    // job1 already proved this (optionalItem was Unanswered and Pass succeeded) — assert again explicitly for clarity.
    const job1Inspection = await db.qCInspection.findFirst({ where: { jobId: job1.id } });
    const job1Checklist = job1Inspection?.checklist as any[];
    const optionalEntry = job1Checklist.find((i) => i.id === optionalItem.id);
    assert(optionalEntry?.result === "Unanswered", "Optional item's Unanswered result was actually stored (not coerced)");

    // ------------------------------------------------------------------------
    // RESULT SEMANTICS
    // ------------------------------------------------------------------------
    console.log(`\n[Result Semantics] Test 5/6/7 — explicit Unanswered/Passed/Failed stored distinctly...`);
    const job5 = await createReadyForQcJob(`SEM_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job5.id, actorInspectorA);
    await qcService.submitChecklist(job5.id, [
      { id: mandatoryItem.id, result: "Passed" },
      { id: optionalItem.id, result: "Failed", remark: "Vehicle not washed" },
    ], actorInspectorA);
    const job5Inspection = await db.qCInspection.findFirst({ where: { jobId: job5.id } });
    const job5Checklist = job5Inspection?.checklist as any[];
    assert(job5Checklist.find((i) => i.id === mandatoryItem.id)?.result === "Passed", "Explicit Passed stored correctly");
    assert(job5Checklist.find((i) => i.id === optionalItem.id)?.result === "Failed", "Explicit Failed stored correctly");
    assert(
      !job5Checklist.some((i) => i.result === undefined || (i.result !== "Passed" && i.result !== "Failed" && i.result !== "Unanswered")),
      "No item was silently coerced into a boolean-derived Passed default"
    );

    // ------------------------------------------------------------------------
    // FAILED-ITEM REMARK
    // ------------------------------------------------------------------------
    console.log(`\n[Remark] Test 8 — Failed with meaningful remark → accepted...`);
    const job8 = await createReadyForQcJob(`RMK8_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job8.id, actorInspectorA);
    const savedRemark = await qcService.submitChecklist(job8.id, [{ id: mandatoryItem.id, result: "Failed", remark: "Cracked headlight" }], actorInspectorA);
    assert(savedRemark !== null, "Failed item with a meaningful remark is accepted");

    console.log(`\n[Remark] Test 9 — Failed with empty remark → rejected...`);
    const job9 = await createReadyForQcJob(`RMK9_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job9.id, actorInspectorA);
    errorCaught = false;
    try {
      await qcService.submitChecklist(job9.id, [{ id: mandatoryItem.id, result: "Failed", remark: "" }], actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("remark"), "Rejection message identifies the missing remark");
    }
    assert(errorCaught, "Failed item with empty remark is rejected");

    console.log(`\n[Remark] Test 10 — Failed with whitespace-only remark → rejected...`);
    const job10 = await createReadyForQcJob(`RMK10_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job10.id, actorInspectorA);
    errorCaught = false;
    try {
      await qcService.submitChecklist(job10.id, [{ id: mandatoryItem.id, result: "Failed", remark: "   " }], actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
    }
    assert(errorCaught, "Failed item with whitespace-only remark is rejected");

    console.log(`\n[Remark] Test 11/12 — Passed with/without remark → both accepted...`);
    const job11 = await createReadyForQcJob(`RMK11_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job11.id, actorInspectorA);
    const noRemarkResult = await qcService.submitChecklist(job11.id, [{ id: mandatoryItem.id, result: "Passed" }], actorInspectorA);
    assert(noRemarkResult !== null, "Passed item without remark accepted");
    const withRemarkResult = await qcService.submitChecklist(job11.id, [{ id: mandatoryItem.id, result: "Passed", remark: "All good" }], actorInspectorA);
    assert(withRemarkResult !== null, "Passed item WITH remark also accepted");

    // ------------------------------------------------------------------------
    // DUPLICATES
    // ------------------------------------------------------------------------
    console.log(`\n[Duplicates] Test 13 — duplicate checklist item ID rejected...`);
    const job13 = await createReadyForQcJob(`DUP13_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job13.id, actorInspectorA);
    errorCaught = false;
    try {
      await qcService.submitChecklist(job13.id, [
        { id: mandatoryItem.id, result: "Passed" },
        { id: mandatoryItem.id, result: "Failed", remark: "conflicting entry" },
      ], actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("duplicate"), "Rejection message identifies the duplicate ID");
    }
    assert(errorCaught, "Duplicate checklist item ID in one submission is rejected");

    console.log(`\n[Duplicates] Test 14 — unknown item ID rejected (regression)...`);
    errorCaught = false;
    try {
      await qcService.submitChecklist(job13.id, [{ id: `${testRunId}_NOT_REAL`, result: "Passed" }], actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not in the configured template"), "Unknown ID rejection message unchanged from Phase 4A");
    }
    assert(errorCaught, "Unknown checklist item ID is still rejected");

    // ------------------------------------------------------------------------
    // ORDERING
    // ------------------------------------------------------------------------
    console.log(`\n[Ordering] Test 15 — deterministic tie-break for equal (category, order)...`);
    const tieItemA = await qcService.createChecklistTemplateItem(
      { category: `${testRunId}_TieCat`, label: "Tie A", order: 5, franchiseId: testFranchiseA.id, mandatory: false },
      testManagerA
    );
    const tieItemB = await qcService.createChecklistTemplateItem(
      { category: `${testRunId}_TieCat`, label: "Tie B", order: 5, franchiseId: testFranchiseA.id, mandatory: false },
      testManagerA
    );
    const expectedOrder = [tieItemA.id, tieItemB.id].sort();
    const fetch1 = await qcService.getChecklistTemplate(testFranchiseA.id);
    const fetch2 = await qcService.getChecklistTemplate(testFranchiseA.id);
    const tieOrder1 = fetch1.filter((i) => i.category === `${testRunId}_TieCat`).map((i) => i.id);
    const tieOrder2 = fetch2.filter((i) => i.category === `${testRunId}_TieCat`).map((i) => i.id);
    assert(JSON.stringify(tieOrder1) === JSON.stringify(expectedOrder), "Tied (category, order) items resolve in deterministic id-ascending order");
    assert(JSON.stringify(tieOrder1) === JSON.stringify(tieOrder2), "Repeated fetches produce identical ordering, not just coincidentally matching once");

    // ------------------------------------------------------------------------
    // LIFECYCLE — finalized inspection immutability (re-confirmed under this phase's changes)
    // ------------------------------------------------------------------------
    console.log(`\n[Lifecycle] Test 16 — finalized inspection checklist cannot be changed...`);
    const job1FinalInspection = await db.qCInspection.findFirst({ where: { jobId: job1.id } });
    const checklistBefore = job1FinalInspection?.checklist;
    const mutationResult = await qcRepository.updateInspection(job1FinalInspection!.id, { checklist: [{ id: "tampered", result: "Passed" }] });
    assert(mutationResult === null, "updateInspection rejects a write against the finalized (Passed) job1 attempt");
    const job1InspectionAfter = await db.qCInspection.findUnique({ where: { id: job1FinalInspection!.id } });
    assert(JSON.stringify(job1InspectionAfter?.checklist) === JSON.stringify(checklistBefore), "Finalized checklist snapshot unchanged");

    // ------------------------------------------------------------------------
    // TENANT ISOLATION
    // ------------------------------------------------------------------------
    console.log(`\n[Tenant Isolation] Test 17 — Franchise A cannot submit a Franchise B-only item...`);
    const job17 = await createReadyForQcJob(`ISO17_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job17.id, actorInspectorA);
    errorCaught = false;
    try {
      await qcService.submitChecklist(job17.id, [{ id: franchiseBItem.id, result: "Passed" }], actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not in the configured template"), "Franchise B's private item is treated as unknown for a Franchise A job");
    }
    assert(errorCaught, "Franchise A cannot submit a checklist entry for Franchise B's own template item");

    // ------------------------------------------------------------------------
    // CONCURRENCY — closure fix: DB-backed template duplicate prevention
    // ------------------------------------------------------------------------
    console.log(`\n[Concurrency] Test 18 — 10 concurrent identical GLOBAL creates → exactly 1 succeeds...`);
    const concGlobalCategory = `${testRunId}_ConcGlobal`;
    const concGlobalLabel = `${testRunId} Global Concurrent Item`;
    // Mix of exact, uppercase, and mixed-case label/category across the 10
    // concurrent attempts — proves the DB index's case-insensitivity holds
    // under an actual race, not only sequentially.
    const globalAttempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => {
        const variant = i % 3 === 0 ? concGlobalCategory.toUpperCase() : concGlobalCategory;
        const labelVariant = i % 3 === 1 ? concGlobalLabel.toUpperCase() : concGlobalLabel;
        return qcService.createChecklistTemplateItem(
          { category: variant, label: labelVariant, order: 1, mandatory: false },
          testHqUser
        );
      })
    );
    const globalFulfilled = globalAttempts.filter((r) => r.status === "fulfilled");
    const globalRejected = globalAttempts.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    assert(globalFulfilled.length === 1, `Exactly 1 of 10 concurrent global creates succeeded (got ${globalFulfilled.length})`);
    assert(globalRejected.length === 9, `Exactly 9 of 10 concurrent global creates rejected (got ${globalRejected.length})`);
    assert(
      globalRejected.every((r) => String(r.reason?.message || "").includes("already exists")),
      "Every rejected global create surfaced the clean domain error, not a raw Prisma/Postgres error"
    );
    const globalRows = await db.qCChecklistTemplate.findMany({
      where: { franchiseId: null, isDeleted: false, category: { equals: concGlobalCategory, mode: "insensitive" } },
    });
    assert(globalRows.length === 1, `Database contains exactly 1 global row after the race (found ${globalRows.length})`);

    console.log(`\n[Concurrency] Test 19 — 10 concurrent identical SAME-FRANCHISE creates → exactly 1 succeeds...`);
    const concFranchiseCategory = `${testRunId}_ConcFranchise`;
    const concFranchiseLabel = `${testRunId} Franchise Concurrent Item`;
    const franchiseAttempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        qcService.createChecklistTemplateItem(
          { category: i % 2 === 0 ? concFranchiseCategory : concFranchiseCategory.toLowerCase(), label: concFranchiseLabel, order: 1, mandatory: false },
          testManagerA
        )
      )
    );
    const franchiseFulfilled = franchiseAttempts.filter((r) => r.status === "fulfilled");
    const franchiseRejected = franchiseAttempts.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    assert(franchiseFulfilled.length === 1, `Exactly 1 of 10 concurrent same-franchise creates succeeded (got ${franchiseFulfilled.length})`);
    assert(franchiseRejected.length === 9, `Exactly 9 of 10 concurrent same-franchise creates rejected (got ${franchiseRejected.length})`);
    assert(
      franchiseRejected.every((r) => String(r.reason?.message || "").includes("already exists")),
      "Every rejected franchise create surfaced the clean domain error, not a raw Prisma/Postgres error"
    );
    const franchiseRows = await db.qCChecklistTemplate.findMany({
      where: { franchiseId: testFranchiseA.id, isDeleted: false, category: { equals: concFranchiseCategory, mode: "insensitive" } },
    });
    assert(franchiseRows.length === 1, `Database contains exactly 1 franchise-A row after the race (found ${franchiseRows.length})`);

    console.log(`\n[Concurrency] Test 20 — same (category,label) raced concurrently across TWO DIFFERENT franchises remains allowed for both...`);
    const concCrossCategory = `${testRunId}_ConcCross`;
    const concCrossLabel = `${testRunId} Cross Concurrent Item`;
    const crossAttempts = await Promise.allSettled([
      ...Array.from({ length: 5 }, () =>
        qcService.createChecklistTemplateItem({ category: concCrossCategory, label: concCrossLabel, order: 1, mandatory: false }, testManagerA)
      ),
      ...Array.from({ length: 5 }, () =>
        qcService.createChecklistTemplateItem({ category: concCrossCategory, label: concCrossLabel, order: 1, mandatory: false }, testManagerB)
      ),
    ]);
    const crossFulfilled = crossAttempts.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    assert(crossFulfilled.length === 2, `Exactly 2 total succeed — 1 per franchise — out of 10 racing across two franchises (got ${crossFulfilled.length})`);
    const crossFranchiseIds = new Set(crossFulfilled.map((r) => r.value.franchiseId));
    assert(
      crossFranchiseIds.has(testFranchiseA.id) && crossFranchiseIds.has(testFranchiseB.id),
      "The one winner from each franchise's batch is that franchise's own row — no cross-franchise blocking"
    );
    const crossRows = await db.qCChecklistTemplate.findMany({
      where: { isDeleted: false, category: { equals: concCrossCategory, mode: "insensitive" }, franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } },
    });
    assert(crossRows.length === 2, `Database contains exactly 2 rows total (1 per franchise) after the cross-franchise race (found ${crossRows.length})`);

  } finally {
    console.log(`\n[Clean Up] Cleaning up Phase 4B-2C test data...`);
    // Global (franchiseId: null) rows created by Test 18 aren't covered by
    // the franchiseId-in-[A,B] filters below — clean up by category prefix.
    await db.qCChecklistTemplate.deleteMany({ where: { franchiseId: null, category: { startsWith: testRunId } } }).catch(() => {});
    // Franchise-scoped version rows created for the fixture items above —
    // never touches the global (HQ) scope, so the real bootstrapped HQ
    // version is never at risk here.
    await db.qCChecklistTemplateVersion.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
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
  console.log(`PHASE 4B-2C TEST RESULTS SUMMARY:`);
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
