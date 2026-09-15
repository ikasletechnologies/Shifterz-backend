// Phase 4B-2A — QC lifecycle integrity: explicit-assignment race safety,
// inspector eligibility validation, Start authorization, Job-status
// preconditions, and finalized-inspection mutation protection.
//
// Test 10 (Phase 4A regression) is intentionally NOT duplicated in this file
// — it's satisfied by running tests/phase4a_qc_integrity.test.ts separately
// (see the Phase 4B-2A validation report for that run's results).
import { db } from '../src/lib/db.js';
import { JobCardService } from '../src/modules/job-card/service/job-card.service.js';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { QcService } from '../src/modules/qc/qc.service.js';
import { QcRepository } from '../src/modules/qc/qc.repository.js';

const testRunId = `P4B2A_${Date.now()}`;
console.log(`=======================================================`);
console.log(`STARTING PHASE 4B-2A QC LIFECYCLE INTEGRITY TESTS`);
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

  const testFranchiseA = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_A`, name: "Phase 4B-2A Test Branch A", city: "Chennai", owner: "Tester A",
      phone: "9111111111", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });
  const testFranchiseB = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_B`, name: "Phase 4B-2A Test Branch B", city: "Bangalore", owner: "Tester B",
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
  const testInspectorInactive = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_QI_INACTIVE`, name: `QI Inactive ${testRunId}`, role: "QUALITY_INSPECTOR",
      phone: "9111110003", email: `qiinactive_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Inactive",
    },
  });
  const testInspectorDeleted = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_QI_DELETED`, name: `QI Deleted ${testRunId}`, role: "QUALITY_INSPECTOR",
      phone: "9111110004", email: `qideleted_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Active",
      isDeleted: true,
    },
  });
  const testInspectorB = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_QIB`, name: `QI Beta ${testRunId}`, role: "QUALITY_INSPECTOR",
      phone: "9222220002", email: `qib_${testRunId}@test.com`, franchiseId: testFranchiseB.id, status: "Active",
    },
  });

  const testManagerA = { id: `${testRunId}_MGR_A`, name: "Manager Alpha", role: "BRANCH_MANAGER", franchiseId: testFranchiseA.id };
  const actorInspectorA = { id: testInspectorA.id, name: testInspectorA.name, role: "QUALITY_INSPECTOR", franchiseId: testFranchiseA.id };
  const actorTechA = { id: testTechA.id, name: testTechA.name, role: "TECHNICIAN", franchiseId: testFranchiseA.id };

  const templateItem1 = await qcService.createChecklistTemplateItem(
    { category: "Exterior", label: `${testRunId} No scratches`, order: 1, franchiseId: testFranchiseA.id },
    testManagerA
  );

  async function createReadyForQcJob(vehicleSuffix: string) {
    const checkin = await checkinService.createCheckin({
      vehicle: `TN 04 P4B2A ${vehicleSuffix}`, model: "Honda City", customer: "QC Test Customer",
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
    // TEST 1 — 10 concurrent explicit assignments
    // ------------------------------------------------------------------------
    console.log(`\n[Test 1] Concurrent explicit assignment (10x)...`);

    const job1 = await createReadyForQcJob(`ASSIGN10_${Math.floor(1000 + Math.random() * 9000)}`);
    const assignResults = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        qcService.assignInspector(job1.id, { inspectorId: testInspectorA.id }, testManagerA)
      )
    );
    const uniqueAssignIds = new Set(assignResults.map((r) => r.id));
    assert(uniqueAssignIds.size === 1, "10 concurrent assignments resolve to exactly 1 attempt");

    const pendingCountJob1 = await db.qCInspection.count({ where: { jobId: job1.id, result: "Pending" } });
    assert(pendingCountJob1 === 1, "Exactly one Pending inspection exists — no orphan");

    const totalCountJob1 = await db.qCInspection.count({ where: { jobId: job1.id } });
    assert(totalCountJob1 === 1, "Exactly one QCInspection row total — no extra attempts allocated");

    assert(assignResults[0].attemptNumber === 1, "Attempt number is correctly 1, not inflated by the 10 concurrent calls");

    const job1After = await db.job.findUnique({ where: { id: job1.id } });
    assert(job1After?.qcAttemptCount === 1, "Job.qcAttemptCount is not inflated by the 10 concurrent calls");

    // ------------------------------------------------------------------------
    // TEST 2 — assignment when a Pending inspection already exists
    // ------------------------------------------------------------------------
    console.log(`\n[Test 2] Explicit assignment reuses an existing Pending inspection...`);

    const job2 = await createReadyForQcJob(`ASSIGNEXIST_${Math.floor(1000 + Math.random() * 9000)}`);
    const firstAssign = await qcService.assignInspector(job2.id, { inspectorId: testInspectorA.id }, testManagerA);
    const secondAssign = await qcService.assignInspector(job2.id, { inspectorId: testInspectorA.id }, testManagerA);
    assert(secondAssign.id === firstAssign.id, "Second assignment call returns the SAME attempt, not a new one");
    assert(secondAssign.attemptNumber === 1, "Existing attempt's number is unchanged");

    const job2InspectionCount = await db.qCInspection.count({ where: { jobId: job2.id } });
    assert(job2InspectionCount === 1, "No second Pending inspection was created");

    // ------------------------------------------------------------------------
    // TEST 3 — inactive inspector rejected
    // ------------------------------------------------------------------------
    console.log(`\n[Test 3] Assignment to an inactive inspector is rejected...`);

    const job3 = await createReadyForQcJob(`INACTIVE_${Math.floor(1000 + Math.random() * 9000)}`);
    let errorCaught = false;
    try {
      await qcService.assignInspector(job3.id, { inspectorId: testInspectorInactive.id }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.toLowerCase().includes("not an active"), "Rejection message identifies the inspector as inactive");
    }
    assert(errorCaught, "Assignment to an inactive inspector throws");
    const job3InspectionCount = await db.qCInspection.count({ where: { jobId: job3.id } });
    assert(job3InspectionCount === 0, "No inspection was created for the rejected inactive-inspector assignment");

    // ------------------------------------------------------------------------
    // TEST 4 — deleted inspector rejected
    // ------------------------------------------------------------------------
    console.log(`\n[Test 4] Assignment to a deleted inspector is rejected...`);

    errorCaught = false;
    try {
      await qcService.assignInspector(job3.id, { inspectorId: testInspectorDeleted.id }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not found"), "Rejection message treats the deleted inspector as not found");
    }
    assert(errorCaught, "Assignment to a deleted inspector throws");
    const job3InspectionCountAfterDeleted = await db.qCInspection.count({ where: { jobId: job3.id } });
    assert(job3InspectionCountAfterDeleted === 0, "No inspection was created for the rejected deleted-inspector assignment");

    // ------------------------------------------------------------------------
    // TEST 5 — wrong-franchise inspector rejected
    // ------------------------------------------------------------------------
    console.log(`\n[Test 5] Assignment to a wrong-franchise inspector is rejected...`);

    errorCaught = false;
    try {
      await qcService.assignInspector(job3.id, { inspectorId: testInspectorB.id }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not found"), "Rejection message treats the wrong-franchise inspector as not found");
    }
    assert(errorCaught, "Assignment to a wrong-franchise inspector throws");
    const job3InspectionCountAfterWrongFranchise = await db.qCInspection.count({ where: { jobId: job3.id } });
    assert(job3InspectionCountAfterWrongFranchise === 0, "No inspection was created for the rejected wrong-franchise assignment");

    // ------------------------------------------------------------------------
    // TEST 6 — non-QC technician cannot start inspection
    // ------------------------------------------------------------------------
    console.log(`\n[Test 6] Technician cannot Start an inspection...`);

    errorCaught = false;
    try {
      await qcService.getOrCreateOpenInspection(job3.id, actorTechA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("authorized Quality Inspector"), "Rejection message identifies the access-control reason");
    }
    assert(errorCaught, "Technician Start attempt throws");
    const job3InspectionCountAfterTechStart = await db.qCInspection.count({ where: { jobId: job3.id } });
    assert(job3InspectionCountAfterTechStart === 0, "No inspection was created by the rejected technician Start attempt");

    // ------------------------------------------------------------------------
    // TEST 7 — invalid Job status blocks Start / checklist / photos
    // ------------------------------------------------------------------------
    console.log(`\n[Test 7] Invalid Job status (Ready For Billing) blocks all inspection-creating operations...`);

    const job7 = await createReadyForQcJob(`INVALIDSTATUS_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job7.id, actorInspectorA);
    const passedJob7 = await qcService.decide(job7.id, { result: "Passed" }, actorInspectorA);
    assert(passedJob7.status === "Ready For Billing", "Setup: job reaches Ready For Billing");

    const countBeforeInvalidAttempts = await db.qCInspection.count({ where: { jobId: job7.id } });

    errorCaught = false;
    try {
      await qcService.getOrCreateOpenInspection(job7.id, actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("Ready For Billing"), "Start rejects a Ready-For-Billing job with a status-specific message");
    }
    assert(errorCaught, "Start on Ready For Billing job throws");

    errorCaught = false;
    try {
      await qcService.submitChecklist(job7.id, [{ id: templateItem1.id, result: "Passed" }], actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
    }
    assert(errorCaught, "Checklist submission on Ready For Billing job throws");

    errorCaught = false;
    try {
      await qcService.uploadPhotos(job7.id, "FRONT_VIEW", ["/uploads/x.jpg"], actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
    }
    assert(errorCaught, "Photo upload on Ready For Billing job throws");

    const countAfterInvalidAttempts = await db.qCInspection.count({ where: { jobId: job7.id } });
    assert(countAfterInvalidAttempts === countBeforeInvalidAttempts, "No stray Pending attempt was created by any of the three rejected calls");

    // ------------------------------------------------------------------------
    // TEST 8 — valid rework start (Rework Required) still succeeds
    // ------------------------------------------------------------------------
    console.log(`\n[Test 8] Start succeeds for a job at Rework Required (new attempt)...`);

    const job8 = await createReadyForQcJob(`REWORKSTART_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job8.id, actorInspectorA);
    const failedJob8 = await qcService.decide(job8.id, { result: "Failed", reason: "test failure" }, actorInspectorA);
    assert(failedJob8.status === "Rework Required", "Setup: job reaches Rework Required");

    const attempt2Job8 = await qcService.getOrCreateOpenInspection(job8.id, actorInspectorA);
    assert(attempt2Job8.attemptNumber === 2, "Start on a Rework Required job creates attempt #2");
    assert(attempt2Job8.result === "Pending", "New attempt starts Pending");

    // ------------------------------------------------------------------------
    // TEST 9 — finalized inspection checklist mutation is rejected
    // ------------------------------------------------------------------------
    console.log(`\n[Test 9] Finalized inspection checklist cannot be mutated (Passed and Failed)...`);

    // Passed case: reuse job7's already-decided attempt.
    const job7Inspection = await db.qCInspection.findFirst({ where: { jobId: job7.id }, orderBy: { attemptNumber: "desc" } });
    assert(job7Inspection?.result === "Passed", "Setup: job7's attempt is finalized as Passed");
    const checklistBeforePassedMutation = job7Inspection?.checklist ?? null;

    const passedMutationResult = await qcRepository.updateInspection(job7Inspection!.id, { checklist: [{ id: "tampered", result: "Passed" }] });
    assert(passedMutationResult === null, "updateInspection returns null (rejected) for a Passed attempt");

    const job7InspectionAfter = await db.qCInspection.findUnique({ where: { id: job7Inspection!.id } });
    assert(JSON.stringify(job7InspectionAfter?.checklist) === JSON.stringify(checklistBeforePassedMutation), "Passed attempt's stored checklist is unchanged");

    // Failed case: reuse job8's attempt 1 (Failed).
    const job8Attempt1 = await db.qCInspection.findFirst({ where: { jobId: job8.id, attemptNumber: 1 } });
    assert(job8Attempt1?.result === "Failed", "Setup: job8 attempt 1 is finalized as Failed");
    const checklistBeforeFailedMutation = job8Attempt1?.checklist ?? null;

    const failedMutationResult = await qcRepository.updateInspection(job8Attempt1!.id, { checklist: [{ id: "tampered", result: "Failed" }] });
    assert(failedMutationResult === null, "updateInspection returns null (rejected) for a Failed attempt");

    const job8Attempt1After = await db.qCInspection.findUnique({ where: { id: job8Attempt1!.id } });
    assert(JSON.stringify(job8Attempt1After?.checklist) === JSON.stringify(checklistBeforeFailedMutation), "Failed attempt's stored checklist is unchanged");

    // Sanity: the same method still works normally against a genuinely Pending attempt.
    const stillPendingUpdate = await qcRepository.updateInspection(attempt2Job8.id, { checklist: [{ id: templateItem1.id, result: "Passed" }] });
    assert(stillPendingUpdate !== null, "updateInspection still succeeds normally against a Pending attempt");

  } finally {
    console.log(`\n[Clean Up] Cleaning up Phase 4B-2A test data...`);
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
  console.log(`PHASE 4B-2A TEST RESULTS SUMMARY:`);
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
