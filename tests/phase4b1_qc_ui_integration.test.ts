// Phase 4B-1 — verifies the canonical QC UI/API integration: the exact
// sequence the rewired frontend now drives (start -> template -> checklist ->
// photos -> decision), confirming it lands entirely on QCInspection/JobPhoto
// and never touches the legacy Job.checklist/Job.qcPhotos fields.
import { db } from '../src/lib/db.js';
import { JobCardService } from '../src/modules/job-card/service/job-card.service.js';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { QcService } from '../src/modules/qc/qc.service.js';
import { QcRepository } from '../src/modules/qc/qc.repository.js';
import { QcTemplateVersionService } from '../src/modules/qc/qc-template-version.service.js';

const testRunId = `P4B1_${Date.now()}`;
console.log(`=======================================================`);
console.log(`STARTING PHASE 4B-1 QC UI/API INTEGRATION TESTS`);
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
  const qcRepository = new QcRepository();

  const testFranchiseA = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_A`, name: "Phase 4B-1 Test Branch A", city: "Chennai", owner: "Tester A",
      phone: "9111111111", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
    },
  });
  const testFranchiseB = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_B`, name: "Phase 4B-1 Test Branch B", city: "Bangalore", owner: "Tester B",
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

  // A franchise-scoped checklist template, exactly as an HQ/franchise admin
  // would configure via POST /qc/checklist-template. Kept for Group 2's own
  // "does the template CRUD/read round-trip work" assertion (Phase 4B-2D-D
  // note: this legacy CRUD table still exists and still functions on its
  // own terms — it just no longer feeds QC Start).
  const templateItem1 = await qcService.createChecklistTemplateItem(
    { category: "Exterior", label: `${testRunId} No scratches`, order: 1, franchiseId: testFranchiseA.id },
    testManagerA
  );
  const templateItem2 = await qcService.createChecklistTemplateItem(
    { category: "Interior", label: `${testRunId} Clean dashboard`, order: 2, franchiseId: testFranchiseA.id },
    testManagerA
  );

  // Phase 4B-2D-D note: submitChecklist now validates against the frozen
  // checklistDefinition, resolved from published template VERSIONS, not
  // live QCChecklistTemplate rows — publish an equivalent version so the
  // checklist-submission assertions below have real, usable ids.
  const publishedDraft = await versionService.createDraftVersion(
    [
      { logicalItemId: `${testRunId}_LID_1`, label: `${testRunId} No scratches`, category: "Exterior", order: 1, mandatory: false },
      { logicalItemId: `${testRunId}_LID_2`, label: `${testRunId} Clean dashboard`, category: "Interior", order: 2, mandatory: false },
    ],
    testManagerA
  );
  const publishedVersion = await versionService.publishVersion(publishedDraft.id, testManagerA);
  const publishedItem1 = (publishedVersion.items as any[]).find((i) => i.label === `${testRunId} No scratches`);
  const publishedItem2 = (publishedVersion.items as any[]).find((i) => i.label === `${testRunId} Clean dashboard`);

  async function createReadyForQcJob(vehicleSuffix: string) {
    const checkin = await checkinService.createCheckin({
      vehicle: `TN 04 P4B1 ${vehicleSuffix}`, model: "Honda City", customer: "QC Test Customer",
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
    // GROUP 1: START — creates/reuses the correct Pending inspection
    // ------------------------------------------------------------------------
    console.log(`\n[Group 1] Testing canonical Start Inspection...`);

    const job1 = await createReadyForQcJob(`START_${Math.floor(1000 + Math.random() * 9000)}`);
    const startResult1 = await qcService.getOrCreateOpenInspection(job1.id, actorInspectorA);
    assert(startResult1.attemptNumber === 1, "First Start creates attempt #1");
    assert(startResult1.result === "Pending", "New attempt starts Pending");

    const startResult2 = await qcService.getOrCreateOpenInspection(job1.id, actorInspectorA);
    assert(startResult2.id === startResult1.id, "Second Start on the same job reuses the same attempt, no duplicate");

    const inspectionCount1 = await db.qCInspection.count({ where: { jobId: job1.id } });
    assert(inspectionCount1 === 1, "Exactly one QCInspection row exists after two Start calls");

    // ------------------------------------------------------------------------
    // GROUP 2: CHECKLIST — loads from backend template, saves to QCInspection
    // ------------------------------------------------------------------------
    console.log(`\n[Group 2] Testing canonical Checklist flow...`);

    const template = await qcService.getChecklistTemplate(testFranchiseA.id);
    const templateIds = new Set(template.map((t) => t.id));
    assert(templateIds.has(templateItem1.id) && templateIds.has(templateItem2.id), "Franchise template includes both configured items");

    const checklistPayload = [
      { id: publishedItem1.id, result: "Passed" },
      { id: publishedItem2.id, result: "Failed", remark: "Dust on dashboard" },
    ];
    await qcService.submitChecklist(job1.id, checklistPayload, actorInspectorA);

    const inspectionAfterChecklist = await db.qCInspection.findUnique({ where: { id: startResult1.id } });
    const storedChecklist = inspectionAfterChecklist?.checklist as any[];
    assert(Array.isArray(storedChecklist) && storedChecklist.length === 2, "Checklist saved onto QCInspection.checklist");
    assert(storedChecklist.some((i) => i.id === publishedItem2.id && i.label === publishedItem2.label), "Stored item enriched with the frozen definition's label");

    const jobAfterChecklist = await db.job.findUnique({ where: { id: job1.id } });
    assert(jobAfterChecklist?.checklist === null, "Legacy Job.checklist was NOT written by the canonical checklist flow");

    // ------------------------------------------------------------------------
    // GROUP 3: PHOTOS — attaches to the current QCInspection, not Job.qcPhotos
    // ------------------------------------------------------------------------
    console.log(`\n[Group 3] Testing canonical Photo upload...`);

    await qcService.uploadPhotos(job1.id, "FRONT_VIEW", ["/uploads/p4b1-front.jpg"], actorInspectorA);
    const photos = await db.jobPhoto.findMany({ where: { qcInspectionId: startResult1.id } });
    assert(photos.length === 1 && photos[0].category === "FRONT_VIEW", "Photo attached to the current QCInspection via qcInspectionId");

    const jobAfterPhoto = await db.job.findUnique({ where: { id: job1.id } });
    assert((jobAfterPhoto?.qcPhotos || []).length === 0, "Legacy Job.qcPhotos was NOT written by the canonical photo flow");

    // ------------------------------------------------------------------------
    // GROUP 4: PASS — requires the canonical inspection, one history event
    // ------------------------------------------------------------------------
    console.log(`\n[Group 4] Testing canonical Pass flow...`);

    const passedJob = await qcService.decide(job1.id, { result: "Passed", remarks: "All good" }, actorInspectorA);
    assert(passedJob.status === "Ready For Billing", "Job reaches Ready For Billing via the canonical decision endpoint");
    const passHistory = await db.jobHistory.count({ where: { jobId: job1.id, event: "QC_PASSED" } });
    assert(passHistory === 1, "Exactly one QC_PASSED JobHistory event");

    // Deciding without ever starting an inspection must still fail cleanly —
    // proves the canonical flow's Start step is genuinely load-bearing.
    const jobNoStart = await createReadyForQcJob(`NOSTART_${Math.floor(1000 + Math.random() * 9000)}`);
    let errorCaught = false;
    try {
      await qcService.decide(jobNoStart.id, { result: "Passed" }, actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("No open QC inspection"), "Deciding without Start is rejected — Start is load-bearing, not decorative");
    }
    assert(errorCaught, "Pass without a prior Start throws");

    // ------------------------------------------------------------------------
    // GROUP 5: FAIL + MULTI-ATTEMPT — Attempt 1 fails, Attempt 2 opens clean
    // ------------------------------------------------------------------------
    console.log(`\n[Group 5] Testing canonical Fail + multi-attempt lifecycle...`);

    const job2 = await createReadyForQcJob(`MULTI_${Math.floor(1000 + Math.random() * 9000)}`);
    const attempt1 = await qcService.getOrCreateOpenInspection(job2.id, actorInspectorA);
    await qcService.submitChecklist(job2.id, [{ id: publishedItem1.id, result: "Failed", remark: "Scratch found" }], actorInspectorA);
    await qcService.uploadPhotos(job2.id, "REAR_VIEW", ["/uploads/p4b1-rear-defect.jpg"], actorInspectorA);

    const failedJob = await qcService.decide(job2.id, { result: "Failed", reason: "Rear scratch" }, actorInspectorA);
    assert(failedJob.status === "Rework Required", "Job reaches Rework Required via the canonical decision endpoint");
    const failHistory = await db.jobHistory.count({ where: { jobId: job2.id, event: "QC_FAILED" } });
    assert(failHistory === 1, "Exactly one QC_FAILED JobHistory event");

    // The queue's own status filter must now surface this job again.
    const queueAfterFail = await qcRepository.getQueue(testFranchiseA.id);
    assert(queueAfterFail.some((j) => j.id === job2.id), "Failed job re-appears in the QC queue at Rework Required");

    const attempt2 = await qcService.getOrCreateOpenInspection(job2.id, actorInspectorA);
    assert(attempt2.id !== attempt1.id, "A NEW attempt is opened for the rework re-entry, not the failed one reused");
    assert(attempt2.attemptNumber === 2, "New attempt is numbered 2");
    assert(attempt2.result === "Pending", "New attempt starts clean at Pending");
    assert(attempt2.checklist === null, "New attempt's checklist is empty — nothing carried over from attempt 1");

    const attempt1AfterNewStart = await db.qCInspection.findUnique({ where: { id: attempt1.id } });
    assert(attempt1AfterNewStart?.result === "Failed", "Attempt 1 remains Failed — untouched by opening attempt 2");
    const attempt1Checklist = attempt1AfterNewStart?.checklist as any[];
    assert(Array.isArray(attempt1Checklist) && attempt1Checklist.length === 1, "Attempt 1's own checklist snapshot is preserved unchanged");

    const attempt1Photos = await db.jobPhoto.count({ where: { qcInspectionId: attempt1.id } });
    const attempt2Photos = await db.jobPhoto.count({ where: { qcInspectionId: attempt2.id } });
    assert(attempt1Photos === 1 && attempt2Photos === 0, "Each attempt keeps its own distinct photo set");

    const totalInspectionsForJob2 = await db.qCInspection.count({ where: { jobId: job2.id } });
    assert(totalInspectionsForJob2 === 2, "Both attempts (1 Failed, 1 Pending) remain stored — no overwrite");

    // ------------------------------------------------------------------------
    // GROUP 6: TENANT ISOLATION on the new canonical entry points
    // ------------------------------------------------------------------------
    console.log(`\n[Group 6] Testing tenant isolation on the canonical flow...`);

    errorCaught = false;
    try {
      await qcService.getOrCreateOpenInspection(job1.id, testManagerB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not found"), "Franchise B cannot Start inspection on Franchise A's job");
    }
    assert(errorCaught, "Cross-franchise Start blocked");

    errorCaught = false;
    try {
      await qcService.submitChecklist(job2.id, [{ id: publishedItem1.id, result: "Passed" }], testManagerB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not found"), "Franchise B cannot submit checklist for Franchise A's job");
    }
    assert(errorCaught, "Cross-franchise checklist blocked");

    errorCaught = false;
    try {
      await qcService.uploadPhotos(job2.id, "FRONT_VIEW", ["/uploads/x.jpg"], testManagerB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not found"), "Franchise B cannot upload QC photos for Franchise A's job");
    }
    assert(errorCaught, "Cross-franchise photo upload blocked");

    errorCaught = false;
    try {
      await qcService.decide(job2.id, { result: "Passed" }, testManagerB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not found"), "Franchise B cannot decide on Franchise A's job");
    }
    assert(errorCaught, "Cross-franchise decision blocked");

  } finally {
    console.log(`\n[Clean Up] Cleaning up Phase 4B-1 test data...`);
    await db.jobHistory.deleteMany({ where: { jobId: { contains: testRunId } } }).catch(() => {});
    await db.jobPhoto.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.qCInspection.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.qCChecklistTemplate.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.qCChecklistTemplateVersion.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.job.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.carIn.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.employee.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.franchise.deleteMany({ where: { id: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    console.log(`Clean up completed.`);
  }

  console.log(`\n=======================================================`);
  console.log(`PHASE 4B-1 TEST RESULTS SUMMARY:`);
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
