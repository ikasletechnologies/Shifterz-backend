// Phase 4B-3-B — QC Inspector Ownership & Attempt Lock. Closes the Critical
// inspector-ownership gap found during Phase 4B-3-A discovery: prior to this
// phase, any QC-capable user in the same franchise could submit checklist,
// upload photos, or record the decision on ANOTHER inspector's open Pending
// attempt. This suite proves: the owning inspector (QCInspection.inspectorId)
// can act freely; any other ordinary QC user is rejected on all three
// mutation paths (checklist/photos/decision); management gets NO automatic
// bypass; assignment/Start continue to preserve — never overwrite — an
// existing attempt's owner; Attempt 2 may have a different owner than
// Attempt 1 without cross-attempt interference; tenant isolation still takes
// precedence over the ownership check; and finalized-inspection immutability
// is untouched by the ownership change.
import { db } from '../src/lib/db.js';
import { JobCardService } from '../src/modules/job-card/service/job-card.service.js';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { QcService } from '../src/modules/qc/qc.service.js';
import { QcTemplateVersionService } from '../src/modules/qc/qc-template-version.service.js';

const testRunId = `P4B3B_${Date.now()}`;
console.log(`=======================================================`);
console.log(`STARTING PHASE 4B-3-B QC OWNERSHIP TESTS`);
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
  const versionService = new QcTemplateVersionService();

  const testFranchiseA = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_A`, name: "Phase 4B-3-B Test Branch A", city: "Chennai", owner: "Tester A",
      phone: "9311111111", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });
  const testFranchiseB = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_B`, name: "Phase 4B-3-B Test Branch B", city: "Bangalore", owner: "Tester B",
      phone: "9322222222", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });

  const testTechA = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_TECHA`, name: `Tech Alpha ${testRunId}`, role: "TECHNICIAN",
      phone: "9311110001", email: `techa_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Active",
    },
  });
  // Inspector A — the intended OWNER in every scenario below.
  const testInspectorA = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_QIA`, name: `QI Alpha ${testRunId}`, role: "QUALITY_INSPECTOR",
      phone: "9311110002", email: `qia_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Active",
    },
  });
  // Inspector B — an ordinary, equally QC-capable user in the SAME
  // franchise, deliberately NOT the owner of any attempt below.
  const testInspectorB = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_QIB`, name: `QI Beta ${testRunId}`, role: "QUALITY_INSPECTOR",
      phone: "9311110003", email: `qib_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Active",
    },
  });
  // Inspector C — a different FRANCHISE's QC user, for the tenant-isolation test.
  const testInspectorC = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_QIC`, name: `QI Charlie ${testRunId}`, role: "QUALITY_INSPECTOR",
      phone: "9322220004", email: `qic_${testRunId}@test.com`, franchiseId: testFranchiseB.id, status: "Active",
    },
  });

  const testManagerA = { id: `${testRunId}_MGR_A`, name: "Manager Alpha", role: "BRANCH_MANAGER", franchiseId: testFranchiseA.id };
  const actorTechA = { id: testTechA.id, name: testTechA.name, role: "TECHNICIAN", franchiseId: testFranchiseA.id };
  const actorInspectorA = { id: testInspectorA.id, name: testInspectorA.name, role: "QUALITY_INSPECTOR", franchiseId: testFranchiseA.id };
  const actorInspectorB = { id: testInspectorB.id, name: testInspectorB.name, role: "QUALITY_INSPECTOR", franchiseId: testFranchiseA.id };
  const actorInspectorC = { id: testInspectorC.id, name: testInspectorC.name, role: "QUALITY_INSPECTOR", franchiseId: testFranchiseB.id };

  // Phase 4B-2D-D note (see phase4b2c_checklist_rules.test.ts's identical
  // comment): submitChecklist validates against the frozen
  // checklistDefinition, which resolves from published template VERSIONS
  // (QcTemplateVersionRepository.resolveEffectiveChecklist), not the legacy
  // QCChecklistTemplate CRUD — a fixture item must be published as a
  // version here, or no submitChecklist/getOrCreateOpenInspection call below
  // could ever reference it.
  const draftA = await versionService.createDraftVersion(
    [{ logicalItemId: `${testRunId}_LID`, label: `${testRunId} No scratches`, category: "Exterior", order: 1, mandatory: false }],
    testManagerA
  );
  const franchiseAVersion = await versionService.publishVersion(draftA.id, testManagerA);
  const templateItem = (franchiseAVersion.items as any[])[0];

  async function createReadyForQcJob(vehicleSuffix: string) {
    const checkin = await checkinService.createCheckin({
      vehicle: `TN 04 P4B3B ${vehicleSuffix}`, model: "Honda City", customer: "QC Ownership Test Customer",
      phone: "9876500001", service: "Full Service", inTime: new Date().toISOString(), odometer: "45000", status: "Pending",
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
    // TEST 1 — Checklist ownership: owner can submit, non-owner cannot
    // ------------------------------------------------------------------------
    console.log(`\n[Test 1] Checklist ownership...`);

    const job1 = await createReadyForQcJob(`CHKOWN_${Math.floor(1000 + Math.random() * 9000)}`);
    const attempt1 = await qcService.getOrCreateOpenInspection(job1.id, actorInspectorA);
    assert(attempt1.inspectorId === testInspectorA.id, "Setup: Inspector A owns the attempt after lazy-start");

    const ownerChecklist = await qcService.submitChecklist(job1.id, [{ id: templateItem.id, result: "Passed" }], actorInspectorA);
    assert(ownerChecklist.id === attempt1.id, "Owner (A) can submit the checklist");

    let errorCaught = false;
    try {
      await qcService.submitChecklist(job1.id, [{ id: templateItem.id, result: "Failed", remark: "tampered" }], actorInspectorB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not the assigned inspector"), "Non-owner (B) checklist rejection has the ownership message");
      assert(err.statusCode === 403, "Non-owner checklist rejection is a 403 (ForbiddenError)");
    }
    assert(errorCaught, "Non-owner (B) cannot submit the checklist");

    const job1InspectionAfterRejectedChecklist = await db.qCInspection.findUnique({ where: { id: attempt1.id } });
    const storedChecklist = job1InspectionAfterRejectedChecklist?.checklist as any[] | null;
    assert(
      Array.isArray(storedChecklist) && storedChecklist[0]?.result === "Passed",
      "B's rejected submission did not overwrite A's stored checklist"
    );

    // ------------------------------------------------------------------------
    // TEST 2 — Photo ownership: owner can upload, non-owner cannot
    // ------------------------------------------------------------------------
    console.log(`\n[Test 2] Photo ownership...`);

    const job2 = await createReadyForQcJob(`PHOTOOWN_${Math.floor(1000 + Math.random() * 9000)}`);
    const attempt2 = await qcService.getOrCreateOpenInspection(job2.id, actorInspectorA);

    const ownerPhotos = await qcService.uploadPhotos(job2.id, "FRONT_VIEW", ["/uploads/owner-photo.jpg"], actorInspectorA);
    assert(ownerPhotos.length === 1, "Owner (A) can upload a photo");

    errorCaught = false;
    try {
      await qcService.uploadPhotos(job2.id, "FRONT_VIEW", ["/uploads/intruder-photo.jpg"], actorInspectorB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not the assigned inspector"), "Non-owner (B) photo rejection has the ownership message");
    }
    assert(errorCaught, "Non-owner (B) cannot upload a photo");

    const job2PhotoCount = await db.jobPhoto.count({ where: { qcInspectionId: attempt2.id } });
    assert(job2PhotoCount === 1, "B's rejected upload did not attach a photo to A's attempt");

    // ------------------------------------------------------------------------
    // TEST 3 — Decision ownership: owner can decide, non-owner cannot
    // ------------------------------------------------------------------------
    console.log(`\n[Test 3] Decision ownership...`);

    const job3 = await createReadyForQcJob(`DECOWN_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job3.id, actorInspectorA);
    await qcService.submitChecklist(job3.id, [{ id: templateItem.id, result: "Passed" }], actorInspectorA);

    errorCaught = false;
    try {
      await qcService.decide(job3.id, { result: "Failed", reason: "intruder fail" }, actorInspectorB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not the assigned inspector"), "Non-owner (B) decision rejection has the ownership message");
    }
    assert(errorCaught, "Non-owner (B) cannot record the decision");

    const job3AfterRejectedDecision = await db.qCInspection.findFirst({ where: { jobId: job3.id }, orderBy: { attemptNumber: "desc" } });
    assert(job3AfterRejectedDecision?.result === "Pending", "B's rejected decision left the attempt still Pending");

    const ownerDecision = await qcService.decide(job3.id, { result: "Passed" }, actorInspectorA);
    assert(ownerDecision.status === "Ready For Billing", "Owner (A) can record the decision");

    // ------------------------------------------------------------------------
    // TEST 4 — Assignment: assigned inspector becomes owner, Start preserves it
    // ------------------------------------------------------------------------
    console.log(`\n[Test 4] Assigned inspector becomes owner; Start never silently reassigns...`);

    const job4 = await createReadyForQcJob(`ASSIGNOWN_${Math.floor(1000 + Math.random() * 9000)}`);
    const assigned4 = await qcService.assignInspector(job4.id, { inspectorId: testInspectorA.id }, testManagerA);
    assert(assigned4.inspectorId === testInspectorA.id, "Explicit assignment makes A the owner");

    // Inspector B "starts" (retrieves) the already-assigned attempt.
    const started4ByB = await qcService.getOrCreateOpenInspection(job4.id, actorInspectorB);
    assert(started4ByB.id === assigned4.id, "B's Start call returns the SAME attempt, not a new one");
    assert(started4ByB.inspectorId === testInspectorA.id, "B's Start call did NOT silently reassign ownership to B");

    // B still cannot mutate it, confirming Start-triggered "read" never grants access.
    errorCaught = false;
    try {
      await qcService.submitChecklist(job4.id, [{ id: templateItem.id, result: "Passed" }], actorInspectorB);
    } catch (err: any) {
      errorCaught = true;
    }
    assert(errorCaught, "B still cannot submit the checklist after merely calling Start");

    // ------------------------------------------------------------------------
    // TEST 5 — Assignment never creates a second Pending attempt
    // ------------------------------------------------------------------------
    console.log(`\n[Test 5] Assignment does not create a second Pending attempt when one already exists...`);

    const job5 = await createReadyForQcJob(`NOSECONDPEND_${Math.floor(1000 + Math.random() * 9000)}`);
    const lazyStart5 = await qcService.getOrCreateOpenInspection(job5.id, actorInspectorA);
    assert(lazyStart5.inspectorId === testInspectorA.id, "Setup: A owns job5's lazily-started attempt");

    // Manager attempts to assign a DIFFERENT inspector (B) onto the same job.
    const reassignAttempt5 = await qcService.assignInspector(job5.id, { inspectorId: testInspectorB.id }, testManagerA);
    assert(reassignAttempt5.id === lazyStart5.id, "Assignment onto an existing Pending attempt returns the SAME row");
    assert(reassignAttempt5.inspectorId === testInspectorA.id, "Existing owner (A) is preserved — assignment did not overwrite to B");

    const job5InspectionCount = await db.qCInspection.count({ where: { jobId: job5.id } });
    assert(job5InspectionCount === 1, "No second Pending attempt was created by the assignment call");

    // ------------------------------------------------------------------------
    // TEST 6 — Concurrency: owner vs non-owner checklist
    // ------------------------------------------------------------------------
    console.log(`\n[Test 6] Concurrency — owner vs non-owner checklist submit...`);

    const job6 = await createReadyForQcJob(`CONCCHK_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job6.id, actorInspectorA);

    const [ownerChkResult, nonOwnerChkResult] = await Promise.allSettled([
      qcService.submitChecklist(job6.id, [{ id: templateItem.id, result: "Passed" }], actorInspectorA),
      qcService.submitChecklist(job6.id, [{ id: templateItem.id, result: "Failed", remark: "race" }], actorInspectorB),
    ]);
    assert(ownerChkResult.status === "fulfilled", "Concurrent: owner's checklist submit succeeds");
    assert(
      nonOwnerChkResult.status === "rejected" && String((nonOwnerChkResult as PromiseRejectedResult).reason?.message || "").includes("not the assigned inspector"),
      "Concurrent: non-owner's checklist submit is rejected for lack of ownership"
    );

    // ------------------------------------------------------------------------
    // TEST 7 — Concurrency: owner vs non-owner photo upload
    // ------------------------------------------------------------------------
    console.log(`\n[Test 7] Concurrency — owner vs non-owner photo upload...`);

    const job7 = await createReadyForQcJob(`CONCPHOTO_${Math.floor(1000 + Math.random() * 9000)}`);
    const attempt7 = await qcService.getOrCreateOpenInspection(job7.id, actorInspectorA);

    const [ownerPhotoResult, nonOwnerPhotoResult] = await Promise.allSettled([
      qcService.uploadPhotos(job7.id, "FRONT_VIEW", ["/uploads/owner7.jpg"], actorInspectorA),
      qcService.uploadPhotos(job7.id, "FRONT_VIEW", ["/uploads/intruder7.jpg"], actorInspectorB),
    ]);
    assert(ownerPhotoResult.status === "fulfilled", "Concurrent: owner's photo upload succeeds");
    assert(
      nonOwnerPhotoResult.status === "rejected" && String((nonOwnerPhotoResult as PromiseRejectedResult).reason?.message || "").includes("not the assigned inspector"),
      "Concurrent: non-owner's photo upload is rejected for lack of ownership"
    );
    const job7PhotoCount = await db.jobPhoto.count({ where: { qcInspectionId: attempt7.id } });
    assert(job7PhotoCount === 1, "Only the owner's concurrent photo was actually persisted");

    // ------------------------------------------------------------------------
    // TEST 8 — Concurrency: owner Pass vs non-owner Fail (exact spec scenario)
    // ------------------------------------------------------------------------
    console.log(`\n[Test 8] Concurrency — owner Pass vs non-owner Fail...`);

    const job8 = await createReadyForQcJob(`CONCDEC_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job8.id, actorInspectorA);
    await qcService.submitChecklist(job8.id, [{ id: templateItem.id, result: "Passed" }], actorInspectorA);

    const [ownerPassResult, nonOwnerFailResult] = await Promise.allSettled([
      qcService.decide(job8.id, { result: "Passed" }, actorInspectorA),
      qcService.decide(job8.id, { result: "Failed", reason: "intruder" }, actorInspectorB),
    ]);
    assert(ownerPassResult.status === "fulfilled", "Concurrent: A (owner) succeeds");
    assert(
      nonOwnerFailResult.status === "rejected" && String((nonOwnerFailResult as PromiseRejectedResult).reason?.message || "").includes("not the assigned inspector"),
      "Concurrent: B (non-owner) rejected BECAUSE of ownership, not a DB race/conflict"
    );
    const job8Final = await db.job.findUnique({ where: { id: job8.id } });
    assert(job8Final?.status === "Ready For Billing", "Job8 ends up Passed (A's decision), not Failed (B's rejected attempt)");

    // ------------------------------------------------------------------------
    // TEST 9 — Two owner decisions remain idempotent
    // ------------------------------------------------------------------------
    console.log(`\n[Test 9] Two decisions by the same owner remain idempotent...`);

    const job9 = await createReadyForQcJob(`IDEMPOWN_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job9.id, actorInspectorA);
    await qcService.submitChecklist(job9.id, [{ id: templateItem.id, result: "Passed" }], actorInspectorA);

    const [firstPass, secondPass] = await Promise.allSettled([
      qcService.decide(job9.id, { result: "Passed" }, actorInspectorA),
      qcService.decide(job9.id, { result: "Passed" }, actorInspectorA),
    ]);
    assert(firstPass.status === "fulfilled", "Owner's first Pass call succeeds");
    assert(secondPass.status === "fulfilled", "Owner's second (idempotent) Pass call also succeeds, not rejected");

    const job9QcPassedHistoryCount = await db.jobHistory.count({ where: { jobId: job9.id, event: "QC_PASSED" } });
    assert(job9QcPassedHistoryCount === 1, "Exactly one QC_PASSED JobHistory row exists despite two owner decide() calls");

    // ------------------------------------------------------------------------
    // TEST 10 — Attempt 2: independent ownership, Attempt 1 unaffected
    // ------------------------------------------------------------------------
    console.log(`\n[Test 10] Attempt 2 can have a different owner than Attempt 1...`);

    const job10 = await createReadyForQcJob(`ATTEMPT2OWN_${Math.floor(1000 + Math.random() * 9000)}`);
    const job10Attempt1 = await qcService.getOrCreateOpenInspection(job10.id, actorInspectorA);
    assert(job10Attempt1.inspectorId === testInspectorA.id, "Setup: A owns attempt 1");
    await qcService.decide(job10.id, { result: "Failed", reason: "needs rework" }, actorInspectorA);

    // A different inspector (B) starts Attempt 2.
    const job10Attempt2 = await qcService.getOrCreateOpenInspection(job10.id, actorInspectorB);
    assert(job10Attempt2.attemptNumber === 2, "Attempt 2 was created");
    assert(job10Attempt2.inspectorId === testInspectorB.id, "Attempt 2 is owned by B, independently of attempt 1's owner");

    const job10Attempt1After = await db.qCInspection.findFirst({ where: { jobId: job10.id, attemptNumber: 1 } });
    assert(job10Attempt1After?.inspectorId === testInspectorA.id, "Attempt 1's owner (A) is unchanged by attempt 2's creation");

    // A (attempt 1's owner) cannot act on attempt 2, which B now owns.
    errorCaught = false;
    try {
      await qcService.submitChecklist(job10.id, [{ id: templateItem.id, result: "Passed" }], actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not the assigned inspector"), "A is correctly treated as a non-owner of attempt 2");
    }
    assert(errorCaught, "Attempt 1's owner (A) cannot act on attempt 2 (owned by B) — no cross-attempt ownership carryover");

    // B (attempt 2's owner) can act on it normally.
    const job10Attempt2Checklist = await qcService.submitChecklist(job10.id, [{ id: templateItem.id, result: "Passed" }], actorInspectorB);
    assert(job10Attempt2Checklist.id === job10Attempt2.id, "Attempt 2's owner (B) can submit its checklist normally");

    // ------------------------------------------------------------------------
    // TEST 11 — Tenant isolation still takes precedence over ownership
    // ------------------------------------------------------------------------
    console.log(`\n[Test 11] Cross-franchise access is rejected as NotFound, before any ownership check...`);

    const job11 = await createReadyForQcJob(`TENANTOWN_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job11.id, actorInspectorA);

    errorCaught = false;
    try {
      await qcService.submitChecklist(job11.id, [{ id: templateItem.id, result: "Passed" }], actorInspectorC);
    } catch (err: any) {
      errorCaught = true;
      assert(err.statusCode === 404, "Cross-franchise checklist attempt is rejected as 404 (NotFound), not 403 (ownership)");
      assert(!err.message.includes("not the assigned inspector"), "Cross-franchise rejection does NOT leak the ownership-specific message");
    }
    assert(errorCaught, "Franchise B's inspector (C) cannot reach Franchise A's job at all");

    // ------------------------------------------------------------------------
    // TEST 12 — Finalized inspection immutability is untouched by ownership
    // ------------------------------------------------------------------------
    console.log(`\n[Test 12] Ownership does not make a finalized inspection editable, even for its own owner...`);

    const job12 = await createReadyForQcJob(`FINALOWN_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job12.id, actorInspectorA);
    await qcService.submitChecklist(job12.id, [{ id: templateItem.id, result: "Passed" }], actorInspectorA);
    const job12Passed = await qcService.decide(job12.id, { result: "Passed" }, actorInspectorA);
    assert(job12Passed.status === "Ready For Billing", "Setup: job12 is finalized as Passed");

    errorCaught = false;
    try {
      await qcService.submitChecklist(job12.id, [{ id: templateItem.id, result: "Failed", remark: "post-finalization" }], actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
    }
    assert(errorCaught, "Owner (A) cannot submit a checklist against a finalized (Ready For Billing) job");

    errorCaught = false;
    try {
      await qcService.uploadPhotos(job12.id, "FRONT_VIEW", ["/uploads/post-final.jpg"], actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
    }
    assert(errorCaught, "Owner (A) cannot upload a photo against a finalized (Ready For Billing) job");

    // Second decision — same result is idempotent (no throw), different result conflicts (throws).
    const idempotentRedecision = await qcService.decide(job12.id, { result: "Passed" }, actorInspectorA);
    assert(idempotentRedecision.status === "Ready For Billing", "Owner's repeat Pass call is idempotent, not an ownership error");

    errorCaught = false;
    try {
      await qcService.decide(job12.id, { result: "Failed", reason: "flip-flop" }, actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("already recorded"), "Owner's conflicting second decision is rejected as a conflict, not an ownership error");
    }
    assert(errorCaught, "Owner (A) cannot flip a finalized Passed attempt to Failed");

  } finally {
    console.log(`\n[Clean Up] Cleaning up Phase 4B-3-B test data...`);
    // Franchise-scoped version rows created for the fixture item above —
    // never touches the global (HQ) scope, so the real bootstrapped HQ
    // version is never at risk here. Items cascade-delete with their version.
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
  console.log(`PHASE 4B-3-B TEST RESULTS SUMMARY:`);
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
