import { db } from '../src/lib/db.js';
import { JobCardService } from '../src/modules/job-card/service/job-card.service.js';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { QcService } from '../src/modules/qc/qc.service.js';
import { QcRepository } from '../src/modules/qc/qc.repository.js';

const testRunId = `P4A_${Date.now()}`;
console.log(`=======================================================`);
console.log(`STARTING PHASE 4A QC CORE INTEGRITY TESTS`);
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
      id: `${testRunId}_FRAN_A`,
      name: "Phase 4A Test Branch A",
      city: "Chennai",
      owner: "Tester A",
      phone: "9111111111",
      since: new Date(),
      revenue: 0,
      jobs: 0,
      royaltyPct: 0,
      status: "Active",
    },
  });

  const testFranchiseB = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_B`,
      name: "Phase 4A Test Branch B",
      city: "Bangalore",
      owner: "Tester B",
      phone: "9222222222",
      since: new Date(),
      revenue: 0,
      jobs: 0,
      royaltyPct: 0,
      status: "Active",
    },
  });

  const testTechA = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_TECHA`,
      name: `Tech Alpha ${testRunId}`,
      role: "TECHNICIAN",
      phone: "9111110001",
      email: `techa_${testRunId}@test.com`,
      franchiseId: testFranchiseA.id,
      status: "Active",
    },
  });

  const testInspectorA = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_QIA`,
      name: `QI Alpha ${testRunId}`,
      role: "QUALITY_INSPECTOR",
      phone: "9111110002",
      email: `qia_${testRunId}@test.com`,
      franchiseId: testFranchiseA.id,
      status: "Active",
    },
  });

  const testInspectorB = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_QIB`,
      name: `QI Beta ${testRunId}`,
      role: "QUALITY_INSPECTOR",
      phone: "9222220002",
      email: `qib_${testRunId}@test.com`,
      franchiseId: testFranchiseB.id,
      status: "Active",
    },
  });

  const testManagerA = { id: `${testRunId}_MGR_A`, name: "Manager Alpha", role: "BRANCH_MANAGER", franchiseId: testFranchiseA.id };
  const testManagerB = { id: `${testRunId}_MGR_B`, name: "Manager Beta", role: "BRANCH_MANAGER", franchiseId: testFranchiseB.id };
  const actorInspectorA = { id: testInspectorA.id, name: testInspectorA.name, role: "QUALITY_INSPECTOR", franchiseId: testFranchiseA.id };
  const actorTechA = { id: testTechA.id, name: testTechA.name, role: "TECHNICIAN", franchiseId: testFranchiseA.id };

  // Builds a Franchise-A job that has already cleared the inspection/estimate
  // gates and sits at "Waiting for Quality Check", ready for the QC module.
  async function createReadyForQcJob(vehicleSuffix: string) {
    const checkin = await checkinService.createCheckin({
      vehicle: `TN 04 P4A ${vehicleSuffix}`,
      model: "Honda City",
      customer: "QC Test Customer",
      phone: "9876500000",
      service: "Full Service",
      inTime: new Date().toISOString(),
      odometer: "45000",
      status: "Pending",
    }, testFranchiseA.id);

    await db.carIn.update({
      where: { id: checkin.id },
      data: {
        scratches: "Minor scratch on rear bumper",
        photoFront: "https://cdn.shifterz.com/photos/front.jpg",
      },
    });

    await jobService.updateJob(checkin.jobCardId!, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    const completed = await jobService.requestCompletion(checkin.jobCardId!, actorTechA);
    return completed;
  }

  try {
    // ------------------------------------------------------------------------
    // GROUP 1: TENANT ISOLATION
    // ------------------------------------------------------------------------
    console.log(`\n[Group 1] Testing QC Tenant Isolation...`);

    const jobA = await createReadyForQcJob(`ISO_${Math.floor(1000 + Math.random() * 9000)}`);
    assert(jobA.status === "Waiting for Quality Check", "Setup: Franchise A job reached Waiting for Quality Check");

    let errorCaught = false;
    try {
      await qcService.getOrCreateOpenInspection(jobA.id, testManagerB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not found"), "Franchise B manager cannot lazy-start QC for Franchise A job");
    }
    assert(errorCaught, "Cross-franchise lazy-start blocked");

    errorCaught = false;
    try {
      await qcService.assignInspector(jobA.id, { inspectorId: testInspectorB.id }, testManagerB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not found"), "Franchise B manager cannot assign an inspector to Franchise A job");
    }
    assert(errorCaught, "Cross-franchise assignment blocked");

    errorCaught = false;
    try {
      await qcService.submitChecklist(jobA.id, [{ id: "nonexistent", result: "Passed" }], testManagerB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not found"), "Franchise B manager cannot submit a checklist for Franchise A job");
    }
    assert(errorCaught, "Cross-franchise checklist submission blocked");

    errorCaught = false;
    try {
      await qcService.listInspections(jobA.id, testManagerB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not found"), "Franchise B manager cannot list Franchise A job's QC inspections");
    }
    assert(errorCaught, "Cross-franchise inspection history read blocked");

    // Franchise A management may not deputize a Franchise B inspector either.
    errorCaught = false;
    try {
      await qcService.assignInspector(jobA.id, { inspectorId: testInspectorB.id }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not found"), "Franchise A manager cannot assign a Franchise B inspector");
    }
    assert(errorCaught, "Cross-franchise inspector assignment blocked");

    // Sanity: the job's own franchise can operate on it normally.
    const ownFranchiseInspection = await qcService.getOrCreateOpenInspection(jobA.id, actorInspectorA);
    assert(ownFranchiseInspection.attemptNumber === 1, "Franchise A inspector can lazy-start QC on its own job");

    // ------------------------------------------------------------------------
    // GROUP 2: CONCURRENCY — LAZY-START ATTEMPT ALLOCATION
    // ------------------------------------------------------------------------
    console.log(`\n[Group 2] Testing Concurrent Lazy-Start QC Inspection Creation (10 requests)...`);

    const jobC = await createReadyForQcJob(`CONC_${Math.floor(1000 + Math.random() * 9000)}`);

    const concurrentInspections = await Promise.all(
      Array.from({ length: 10 }).map(() => qcService.getOrCreateOpenInspection(jobC.id, actorInspectorA))
    );

    const uniqueInspectionIds = new Set(concurrentInspections.map((i) => i.id));
    assert(uniqueInspectionIds.size === 1, "10 concurrent lazy-start requests resolve to exactly 1 inspection");

    const inspectionCountForJobC = await db.qCInspection.count({ where: { jobId: jobC.id } });
    assert(inspectionCountForJobC === 1, "Exactly 1 QCInspection row exists in the database for the job");
    assert(concurrentInspections[0].attemptNumber === 1, "The single inspection has a well-formed attempt number (1)");

    const jobCAfter = await db.job.findUnique({ where: { id: jobC.id } });
    assert(jobCAfter?.qcAttemptCount === 1, "Job.qcAttemptCount incremented exactly once, not 10 times");

    // ------------------------------------------------------------------------
    // GROUP 3: DECISION IDEMPOTENCY
    // ------------------------------------------------------------------------
    console.log(`\n[Group 3] Testing QC Decision Idempotency...`);

    const passedJob = await qcService.decide(jobC.id, { result: "Passed", remarks: "Looks good" }, actorInspectorA);
    assert(passedJob.status === "Ready For Billing", "First 'Passed' decision transitions job to Ready For Billing");
    assert(Boolean(passedJob.passedAt), "Job.passedAt populated on Passed decision");

    let passedHistoryCount = await db.jobHistory.count({ where: { jobId: jobC.id, event: "QC_PASSED" } });
    assert(passedHistoryCount === 1, "Exactly one QC_PASSED JobHistory entry created");

    const retryPassedJob = await qcService.decide(jobC.id, { result: "Passed", remarks: "Looks good" }, actorInspectorA);
    assert(retryPassedJob.status === "Ready For Billing", "Retrying the same 'Passed' decision is a safe no-op");

    passedHistoryCount = await db.jobHistory.count({ where: { jobId: jobC.id, event: "QC_PASSED" } });
    assert(passedHistoryCount === 1, "Retried decision does NOT create a second QC_PASSED history entry");

    errorCaught = false;
    try {
      await qcService.decide(jobC.id, { result: "Failed", reason: "Changed my mind" }, actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("already recorded"), "Conflicting decision (Failed after Passed) is rejected");
    }
    assert(errorCaught, "Conflicting QC decision throws instead of silently overwriting");

    // Mirror the above on the Failed path (Group 3 above only exercised
    // Passed -> Passed retry and Passed -> Failed conflict).
    const jobFailIdem = await createReadyForQcJob(`FIDEM_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(jobFailIdem.id, actorInspectorA);

    const firstFailedJob = await qcService.decide(jobFailIdem.id, { result: "Failed", reason: "Interior trim damaged" }, actorInspectorA);
    assert(firstFailedJob.status === "Rework Required", "First 'Failed' decision transitions job to Rework Required");
    assert(firstFailedJob.reworkCount === 1, "reworkCount incremented to 1 on first Failed decision");

    let failedHistoryCountForIdem = await db.jobHistory.count({ where: { jobId: jobFailIdem.id, event: "QC_FAILED" } });
    assert(failedHistoryCountForIdem === 1, "Exactly one QC_FAILED JobHistory entry created");

    const retryFailedJob = await qcService.decide(jobFailIdem.id, { result: "Failed", reason: "Interior trim damaged" }, actorInspectorA);
    assert(retryFailedJob.status === "Rework Required", "Retrying the same 'Failed' decision is a safe no-op");
    assert(retryFailedJob.reworkCount === 1, "Retried Failed decision does NOT increment reworkCount again");

    failedHistoryCountForIdem = await db.jobHistory.count({ where: { jobId: jobFailIdem.id, event: "QC_FAILED" } });
    assert(failedHistoryCountForIdem === 1, "Retried Failed decision does NOT create a second QC_FAILED history entry");

    errorCaught = false;
    try {
      await qcService.decide(jobFailIdem.id, { result: "Passed" }, actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("already recorded"), "Conflicting decision (Passed after Failed) is rejected");
    }
    assert(errorCaught, "Failed -> Passed conflict is rejected symmetrically to Passed -> Failed");

    // ------------------------------------------------------------------------
    // GROUP 4: CONCURRENT DECISION RACE (Phase 4A closure fix)
    // ------------------------------------------------------------------------
    console.log(`\n[Group 4] Testing Concurrent QC Decision Race Safety...`);

    // --- Test A: 10 concurrent Failed decisions on the same Pending inspection ---
    const jobConcFail = await createReadyForQcJob(`RACEF_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(jobConcFail.id, actorInspectorA);

    const concurrentFailResults = await Promise.allSettled(
      Array.from({ length: 10 }).map(() =>
        qcService.decide(jobConcFail.id, { result: "Failed", reason: "concurrent fail race" }, actorInspectorA)
      )
    );
    const concurrentFailRejections = concurrentFailResults.filter((r) => r.status === "rejected");
    assert(concurrentFailRejections.length === 0, "All 10 concurrent same-result 'Failed' calls resolve without throwing");

    const jobConcFailAfter = await db.job.findUnique({ where: { id: jobConcFail.id } });
    assert(jobConcFailAfter?.status === "Rework Required", "Job reaches Rework Required after concurrent Failed race");
    assert(jobConcFailAfter?.reworkCount === 1, "reworkCount increments EXACTLY ONCE across 10 concurrent Failed calls (not 10)");
    assert(jobConcFailAfter?.isRework === true, "isRework flagged true after concurrent Failed race");

    const concFailHistoryCount = await db.jobHistory.count({ where: { jobId: jobConcFail.id, event: "QC_FAILED" } });
    assert(concFailHistoryCount === 1, "Exactly one QC_FAILED JobHistory row from 10 concurrent Failed calls");

    const concFailInspectionCount = await db.qCInspection.count({ where: { jobId: jobConcFail.id } });
    assert(concFailInspectionCount === 1, "Exactly one QCInspection row exists (no duplicate attempts created)");

    const concFailInspection = await db.qCInspection.findFirst({ where: { jobId: jobConcFail.id } });
    assert(concFailInspection?.result === "Failed", "The single inspection's result is Failed");

    // --- Test B: 10 concurrent Passed decisions on the same Pending inspection ---
    const jobConcPass = await createReadyForQcJob(`RACEP_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(jobConcPass.id, actorInspectorA);

    const concurrentPassResults = await Promise.allSettled(
      Array.from({ length: 10 }).map(() =>
        qcService.decide(jobConcPass.id, { result: "Passed", remarks: "concurrent pass race" }, actorInspectorA)
      )
    );
    const concurrentPassRejections = concurrentPassResults.filter((r) => r.status === "rejected");
    assert(concurrentPassRejections.length === 0, "All 10 concurrent same-result 'Passed' calls resolve without throwing");

    const jobConcPassAfter = await db.job.findUnique({ where: { id: jobConcPass.id } });
    assert(jobConcPassAfter?.status === "Ready For Billing", "Job reaches Ready For Billing after concurrent Passed race");
    assert(Boolean(jobConcPassAfter?.passedAt), "passedAt populated after concurrent Passed race");
    assert(jobConcPassAfter?.reworkCount === 0, "reworkCount remains 0 for a concurrent Passed race");

    const concPassHistoryCount = await db.jobHistory.count({ where: { jobId: jobConcPass.id, event: "QC_PASSED" } });
    assert(concPassHistoryCount === 1, "Exactly one QC_PASSED JobHistory row from 10 concurrent Passed calls");

    const concPassInspectionCount = await db.qCInspection.count({ where: { jobId: jobConcPass.id } });
    assert(concPassInspectionCount === 1, "Exactly one QCInspection row exists (no duplicate attempts created)");

    // --- Test C: concurrent Passed vs Failed on the same Pending inspection ---
    const jobMix = await createReadyForQcJob(`RACEM_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(jobMix.id, actorInspectorA);

    const mixedIntents: Array<"Passed" | "Failed"> = ["Passed", "Failed", "Passed", "Failed", "Passed", "Failed"];
    const mixedResults = await Promise.allSettled(
      mixedIntents.map((result) =>
        result === "Passed"
          ? qcService.decide(jobMix.id, { result }, actorInspectorA)
          : qcService.decide(jobMix.id, { result, reason: "concurrent mixed race" }, actorInspectorA)
      )
    );

    const jobMixAfter = await db.job.findUnique({ where: { id: jobMix.id } });
    const winningResult: "Passed" | "Failed" | null =
      jobMixAfter?.status === "Ready For Billing" ? "Passed" : jobMixAfter?.status === "Rework Required" ? "Failed" : null;
    assert(winningResult !== null, "Concurrent Passed-vs-Failed race resolves to a definite winning terminal status");

    let mixedOutcomeConsistent = true;
    mixedResults.forEach((r, i) => {
      const intended = mixedIntents[i];
      if (intended === winningResult) {
        if (r.status !== "fulfilled") mixedOutcomeConsistent = false;
      } else {
        if (r.status !== "rejected") mixedOutcomeConsistent = false;
        else if (!String((r.reason as any)?.message || "").includes("already recorded")) mixedOutcomeConsistent = false;
      }
    });
    assert(mixedOutcomeConsistent, `Every call matching the winning result (${winningResult}) fulfilled; every opposing call was rejected as a conflict`);

    const mixHistoryCount = await db.jobHistory.count({ where: { jobId: jobMix.id, event: { in: ["QC_PASSED", "QC_FAILED"] } } });
    assert(mixHistoryCount === 1, "Exactly one JobHistory decision event recorded despite 6 concurrent mixed Passed/Failed calls");

    const mixInspection = await db.qCInspection.findFirst({ where: { jobId: jobMix.id } });
    assert(mixInspection?.result === winningResult, "QCInspection.result matches the winning terminal outcome");

    if (winningResult === "Failed") {
      assert(jobMixAfter?.reworkCount === 1, "reworkCount is exactly 1 when Failed wins the mixed race");
    } else {
      assert(jobMixAfter?.reworkCount === 0, "reworkCount remains 0 when Passed wins the mixed race");
    }

    // ------------------------------------------------------------------------
    // GROUP 5: ATOMICITY — TRANSACTION ROLLBACK
    // ------------------------------------------------------------------------
    console.log(`\n[Group 5] Testing QC Decision Transaction Atomicity...`);

    const jobD = await createReadyForQcJob(`ATOM_${Math.floor(1000 + Math.random() * 9000)}`);
    const inspectionD = await qcService.getOrCreateOpenInspection(jobD.id, actorInspectorA);
    assert(inspectionD.result === "Pending", "Setup: fresh inspection is Pending before the failure simulation");

    errorCaught = false;
    try {
      // Force a mid-transaction failure: the inspection update inside
      // recordDecision succeeds, but the subsequent Job update fails because
      // this jobId doesn't exist — the whole transaction must roll back.
      await qcRepository.recordDecision(`${testRunId}_NONEXISTENT_JOB`, inspectionD.id, {
        result: "Passed",
        performedBy: "tester",
      });
    } catch (err: any) {
      errorCaught = true;
    }
    assert(errorCaught, "Simulated mid-transaction failure throws as expected");

    const inspectionDAfterFailure = await db.qCInspection.findUnique({ where: { id: inspectionD.id } });
    assert(inspectionDAfterFailure?.result === "Pending", "Inspection update was rolled back — still Pending");
    assert(inspectionDAfterFailure?.decidedAt === null, "Inspection decidedAt was rolled back — still null");

    const jobDAfterFailure = await db.job.findUnique({ where: { id: jobD.id } });
    assert(jobDAfterFailure?.status === "Waiting for Quality Check", "Real Job status untouched by the failed transaction");

    const rolledBackHistoryCount = await db.jobHistory.count({ where: { jobId: jobD.id, event: { in: ["QC_PASSED", "QC_FAILED"] } } });
    assert(rolledBackHistoryCount === 0, "No JobHistory entry was created by the rolled-back transaction");

    // ------------------------------------------------------------------------
    // GROUP 6: REWORK REQUIRED -> WAITING FOR QUALITY CHECK TRANSITION
    // ------------------------------------------------------------------------
    console.log(`\n[Group 6] Testing Rework Required -> Waiting for Quality Check Transition...`);

    const jobE = await createReadyForQcJob(`RWK_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(jobE.id, actorInspectorA);
    const failedJob = await qcService.decide(jobE.id, { result: "Failed", reason: "Paint defect found" }, actorInspectorA);
    assert(failedJob.status === "Rework Required", "'Failed' decision transitions job to Rework Required");
    assert(failedJob.isRework === true, "Job.isRework flagged true after failure");
    assert(failedJob.reworkCount === 1, "Job.reworkCount incremented to 1");

    const failedHistoryEntries = await db.jobHistory.findMany({ where: { jobId: jobE.id, event: "QC_FAILED" } });
    assert(failedHistoryEntries.length === 1, "Exactly one QC_FAILED JobHistory entry created");
    const failedPayload = failedHistoryEntries[0].payload as any;
    assert(failedPayload?.result === "Failed", "QC_FAILED history payload records result=Failed");
    assert(failedPayload?.reason === "Paint defect found", "QC_FAILED history payload records the failure reason");

    // Previously blocked unconditionally by job-card.service.ts's workActiveStatuses
    // check — technician must be able to resubmit reworked jobs into the QC queue.
    const resubmittedJob = await jobService.updateJob(jobE.id, { status: "Waiting for Quality Check" }, actorTechA);
    assert(resubmittedJob.status === "Waiting for Quality Check", "Technician can resubmit a Rework Required job to Waiting for Quality Check");

    // Regression guard: an unrelated invalid source status must still be blocked.
    const jobPending = await jobService.createJob({
      vehicle: `TN 04 PEND ${Math.floor(1000 + Math.random() * 9000)}`,
      customer: "Pending Guard Customer",
      service: "Inspection",
      status: "Pending",
    }, testManagerA);

    errorCaught = false;
    try {
      await jobService.updateJob(jobPending.id, { status: "Waiting for Quality Check" }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("Work must be in progress"), "Pending -> Waiting for Quality Check remains blocked");
    }
    assert(errorCaught, "Non-Rework invalid source statuses are still rejected");
  } finally {
    console.log(`\n[Clean Up] Cleaning up Phase 4A test data...`);
    await db.jobHistory.deleteMany({ where: { jobId: { contains: testRunId } } }).catch(() => {});
    await db.jobPhoto.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.qCInspection.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.job.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.carIn.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.employee.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.franchise.deleteMany({ where: { id: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    console.log(`Clean up completed.`);
  }

  console.log(`\n=======================================================`);
  console.log(`PHASE 4A TEST RESULTS SUMMARY:`);
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
