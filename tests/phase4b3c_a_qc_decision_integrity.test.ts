// Phase 4B-3-C-A — QC Decision Integrity. Implements exactly two business
// rules, both discovered as gaps during Phase 4B-3-C discovery:
//   1. A failed mandatory checklist item must prevent an overall QC Pass
//      (optional-item failures never affect the decision).
//   2. A QC Fail decision must require a non-empty backend `reason`.
// Both rules are enforced inside QcRepository.recordDecision's own
// transaction, against the QCInspection row it locks (`SELECT ... FOR
// UPDATE`) — never against a pre-transaction service-layer snapshot — to
// close the TOCTOU race the discovery identified (a concurrent
// submitChecklist could otherwise flip a mandatory item to Failed between a
// pre-check read and the decision's actual commit). Phase 4B-3-B's
// inspector-ownership rule and the pre-existing mandatory-completeness rule
// are both explicitly re-verified unchanged here, not just assumed.
import { db } from '../src/lib/db.js';
import { JobCardService } from '../src/modules/job-card/service/job-card.service.js';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { QcService } from '../src/modules/qc/qc.service.js';
import { QcTemplateVersionService } from '../src/modules/qc/qc-template-version.service.js';

const testRunId = `P4B3CA_${Date.now()}`;
console.log(`=======================================================`);
console.log(`STARTING PHASE 4B-3-C-A QC DECISION INTEGRITY TESTS`);
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
      id: `${testRunId}_FRAN_A`, name: "Phase 4B-3-C-A Test Branch A", city: "Chennai", owner: "Tester A",
      phone: "9411111111", since: new Date(), revenue: 0, jobs: 0, royaltyPct: 0, status: "Active",
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
  const testInspectorB = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_QIB`, name: `QI Beta ${testRunId}`, role: "QUALITY_INSPECTOR",
      phone: "9411110003", email: `qib_${testRunId}@test.com`, franchiseId: testFranchiseA.id, status: "Active",
    },
  });

  const testManagerA = { id: `${testRunId}_MGR_A`, name: "Manager Alpha", role: "BRANCH_MANAGER", franchiseId: testFranchiseA.id };
  const actorTechA = { id: testTechA.id, name: testTechA.name, role: "TECHNICIAN", franchiseId: testFranchiseA.id };
  const actorInspectorA = { id: testInspectorA.id, name: testInspectorA.name, role: "QUALITY_INSPECTOR", franchiseId: testFranchiseA.id };
  const actorInspectorB = { id: testInspectorB.id, name: testInspectorB.name, role: "QUALITY_INSPECTOR", franchiseId: testFranchiseA.id };

  // Published template version (Phase 4B-2D-D note, same as phase4b2c/
  // phase4b3b): submitChecklist/decide validate against the frozen
  // checklistDefinition, resolved from published VERSIONS, never the legacy
  // QCChecklistTemplate CRUD.
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

  async function createReadyForQcJob(vehicleSuffix: string) {
    const checkin = await checkinService.createCheckin({
      vehicle: `TN 04 P4B3CA ${vehicleSuffix}`, model: "Honda City", customer: "QC Decision Integrity Test Customer",
      phone: "9876500002", service: "Full Service", inTime: new Date().toISOString(), odometer: "45000", status: "Pending",
    }, testFranchiseA.id);
    await db.carIn.update({
      where: { id: checkin.id },
      data: { scratches: "Minor scratch on rear bumper", photoFront: "https://cdn.shifterz.com/photos/front.jpg" },
    });
    await jobService.updateJob(checkin.jobCardId!, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    return jobService.requestCompletion(checkin.jobCardId!, actorTechA);
  }

  try {
    // ========================================================================
    // GROUP 1 — Mandatory checklist vs overall decision (Cases A-D)
    // ========================================================================
    console.log(`\n[Group 1] Mandatory checklist vs overall decision...`);

    console.log(`\n[Test 1] Case A — mandatory Passed → overall Pass succeeds...`);
    const job1 = await createReadyForQcJob(`CASEA_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job1.id, actorInspectorA);
    await qcService.submitChecklist(job1.id, [
      { id: mandatoryItem.id, result: "Passed" },
      { id: optionalItem.id, result: "Unanswered" },
    ], actorInspectorA);
    const passedJob1 = await qcService.decide(job1.id, { result: "Passed" }, actorInspectorA);
    assert(passedJob1.status === "Ready For Billing", "Case A: mandatory Passed → overall Pass succeeds");

    console.log(`\n[Test 2] Case B — mandatory Failed (valid remark) → overall Pass REJECTED...`);
    const job2 = await createReadyForQcJob(`CASEB_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job2.id, actorInspectorA);
    await qcService.submitChecklist(job2.id, [
      { id: mandatoryItem.id, result: "Failed", remark: "Brake pads worn" },
    ], actorInspectorA);
    let errorCaught = false;
    try {
      await qcService.decide(job2.id, { result: "Passed" }, actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.toLowerCase().includes("cannot record an overall pass"), "Case B: rejection message explains the mandatory-Failed reason");
      assert(err.statusCode === 400, "Case B: rejection is a 400 ValidationError");
    }
    assert(errorCaught, "Case B: mandatory Failed → overall Pass is rejected");
    const job2AfterRejectedPass = await db.job.findUnique({ where: { id: job2.id } });
    assert(job2AfterRejectedPass?.status === "Waiting for Quality Check", "Case B: Job.status unchanged after the rejected Pass attempt");
    const job2InspectionAfterRejectedPass = await db.qCInspection.findFirst({ where: { jobId: job2.id } });
    assert(job2InspectionAfterRejectedPass?.result === "Pending", "Case B: QCInspection remains Pending after the rejected Pass attempt");
    const job2QcHistoryAfterRejectedPass = await db.jobHistory.count({ where: { jobId: job2.id, event: { in: ["QC_PASSED", "QC_FAILED"] } } });
    assert(job2QcHistoryAfterRejectedPass === 0, "Case B: no QC_PASSED/QC_FAILED JobHistory row was created by the rejected Pass attempt");

    console.log(`\n[Test 3] Case C — mandatory Failed (valid remark) → overall Fail ALLOWED...`);
    const failedJob2 = await qcService.decide(job2.id, { result: "Failed", reason: "Brake issue confirmed" }, actorInspectorA);
    assert(failedJob2.status === "Rework Required", "Case C: mandatory Failed → overall Fail succeeds");

    console.log(`\n[Test 4] Case D — OPTIONAL item Failed → overall Pass remains ALLOWED...`);
    const job4 = await createReadyForQcJob(`CASED_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job4.id, actorInspectorA);
    await qcService.submitChecklist(job4.id, [
      { id: mandatoryItem.id, result: "Passed" },
      { id: optionalItem.id, result: "Failed", remark: "Vehicle not washed" },
    ], actorInspectorA);
    const passedJob4 = await qcService.decide(job4.id, { result: "Passed" }, actorInspectorA);
    assert(passedJob4.status === "Ready For Billing", "Case D: optional item Failed does NOT block overall Pass");

    console.log(`\n[Test 5] Existing completeness rule preserved — mandatory Unanswered still blocks ANY decision...`);
    const job5 = await createReadyForQcJob(`COMPLETE_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job5.id, actorInspectorA);
    await qcService.submitChecklist(job5.id, [
      { id: optionalItem.id, result: "Passed" },
    ], actorInspectorA);
    errorCaught = false;
    try {
      await qcService.decide(job5.id, { result: "Passed" }, actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("incomplete") && err.message.includes("mandatory"), "Completeness rejection message unchanged in wording");
    }
    assert(errorCaught, "Mandatory item never submitted still blocks the decision (Pass attempted)");
    errorCaught = false;
    try {
      await qcService.decide(job5.id, { result: "Failed", reason: "attempting fail on incomplete checklist" }, actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("incomplete") && err.message.includes("mandatory"), "Completeness rule blocks Fail too, not just Pass");
    }
    assert(errorCaught, "Mandatory item never submitted also blocks a Fail attempt (completeness applies regardless of requested result)");

    // ========================================================================
    // GROUP 2 — TOCTOU fix: validation reads the freshest committed state
    // ========================================================================
    console.log(`\n[Group 2] Decision validates fresh state, not a stale snapshot...`);

    console.log(`\n[Test 6] decide() rejects Pass based on the LATEST submitted checklist, even if it changed after an earlier read...`);
    const job6 = await createReadyForQcJob(`FRESH_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job6.id, actorInspectorA);
    // First submission: fully valid for Pass.
    await qcService.submitChecklist(job6.id, [{ id: mandatoryItem.id, result: "Passed" }], actorInspectorA);
    // Simulates the exact race the discovery identified: something (a
    // concurrent request, in the real-world race) flips the mandatory item
    // to Failed AFTER a hypothetical earlier "looks fine" read.
    await qcService.submitChecklist(job6.id, [{ id: mandatoryItem.id, result: "Failed", remark: "Discovered late" }], actorInspectorA);
    errorCaught = false;
    try {
      await qcService.decide(job6.id, { result: "Passed" }, actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.toLowerCase().includes("cannot record an overall pass"), "decide() correctly used the freshest checklist content, not a stale one");
    }
    assert(errorCaught, "A Pass attempted after the checklist was changed to Failed is rejected — proves no stale-snapshot dependency");

    console.log(`\n[Test 7] Concurrent submitChecklist(flip to Failed) racing decide(Pass) never produces an inconsistent final state...`);
    const job7 = await createReadyForQcJob(`RACE_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job7.id, actorInspectorA);
    await qcService.submitChecklist(job7.id, [{ id: mandatoryItem.id, result: "Passed" }], actorInspectorA);
    await Promise.allSettled([
      qcService.submitChecklist(job7.id, [{ id: mandatoryItem.id, result: "Failed", remark: "race condition" }], actorInspectorA),
      qcService.decide(job7.id, { result: "Passed" }, actorInspectorA),
    ]);
    const job7Final = await db.job.findUnique({ where: { id: job7.id } });
    const job7Inspection = await db.qCInspection.findFirst({ where: { jobId: job7.id }, orderBy: { attemptNumber: "desc" } });
    const job7Checklist = job7Inspection?.checklist as any[] | null;
    const job7MandatoryEntry = job7Checklist?.find((i) => i.id === mandatoryItem.id);
    const invariantHolds = !(job7Final?.status === "Ready For Billing" && job7MandatoryEntry?.result === "Failed");
    assert(invariantHolds, "Invariant holds: never Ready For Billing with a mandatory item persisted as Failed, regardless of race timing");

    // ========================================================================
    // GROUP 3 — Backend Fail reason required
    // ========================================================================
    console.log(`\n[Group 3] Backend Fail reason required...`);

    async function setupSimpleJob(suffix: string) {
      const job = await createReadyForQcJob(suffix);
      await qcService.getOrCreateOpenInspection(job.id, actorInspectorA);
      await qcService.submitChecklist(job.id, [{ id: mandatoryItem.id, result: "Passed" }], actorInspectorA);
      return job;
    }

    console.log(`\n[Test 8] Fail with reason: undefined → rejected...`);
    const job8 = await setupSimpleJob(`REASON_UNDEF_${Math.floor(1000 + Math.random() * 9000)}`);
    errorCaught = false;
    try {
      await qcService.decide(job8.id, { result: "Failed" } as any, actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.toLowerCase().includes("reason is required"), "Rejection message identifies the missing reason");
    }
    assert(errorCaught, "Fail with reason:undefined is rejected");

    console.log(`\n[Test 9] Fail with reason: null → rejected...`);
    const job9 = await setupSimpleJob(`REASON_NULL_${Math.floor(1000 + Math.random() * 9000)}`);
    errorCaught = false;
    try {
      await qcService.decide(job9.id, { result: "Failed", reason: null } as any, actorInspectorA);
    } catch (err: any) { errorCaught = true; }
    assert(errorCaught, "Fail with reason:null is rejected");

    console.log(`\n[Test 10] Fail with reason: "" → rejected...`);
    const job10 = await setupSimpleJob(`REASON_EMPTY_${Math.floor(1000 + Math.random() * 9000)}`);
    errorCaught = false;
    try {
      await qcService.decide(job10.id, { result: "Failed", reason: "" }, actorInspectorA);
    } catch (err: any) { errorCaught = true; }
    assert(errorCaught, `Fail with reason:"" is rejected`);

    console.log(`\n[Test 11] Fail with reason: "   " (whitespace only) → rejected...`);
    const job11 = await setupSimpleJob(`REASON_WS_${Math.floor(1000 + Math.random() * 9000)}`);
    errorCaught = false;
    try {
      await qcService.decide(job11.id, { result: "Failed", reason: "   " }, actorInspectorA);
    } catch (err: any) { errorCaught = true; }
    assert(errorCaught, `Fail with reason:"   " is rejected`);

    console.log(`\n[Test 12] Fail with reason: "\\n\\t" (whitespace-only control chars) → rejected...`);
    const job12 = await setupSimpleJob(`REASON_WSCTRL_${Math.floor(1000 + Math.random() * 9000)}`);
    errorCaught = false;
    try {
      await qcService.decide(job12.id, { result: "Failed", reason: "\n\t" }, actorInspectorA);
    } catch (err: any) { errorCaught = true; }
    assert(errorCaught, `Fail with reason:"\\n\\t" is rejected`);

    console.log(`\n[Test 13] Fail with reason: "Brake issue" → ALLOWED...`);
    const job13 = await setupSimpleJob(`REASON_VALID_${Math.floor(1000 + Math.random() * 9000)}`);
    const failedJob13 = await qcService.decide(job13.id, { result: "Failed", reason: "Brake issue" }, actorInspectorA);
    assert(failedJob13.status === "Rework Required", `Fail with reason:"Brake issue" succeeds`);

    console.log(`\n[Test 14] Pass never requires a reason...`);
    const job14 = await setupSimpleJob(`PASS_NOREASON_${Math.floor(1000 + Math.random() * 9000)}`);
    const passedJob14 = await qcService.decide(job14.id, { result: "Passed" }, actorInspectorA);
    assert(passedJob14.status === "Ready For Billing", "Pass with no reason at all still succeeds");

    // ========================================================================
    // GROUP 4 — Field separation (reason / remarks / item remark / qcNotes)
    // ========================================================================
    console.log(`\n[Group 4] Field separation preserved (reason vs remarks vs item remark vs qcNotes)...`);

    console.log(`\n[Test 15] reason, remarks, and item-level remark stay independent fields; Job.qcNotes untouched...`);
    const job15 = await createReadyForQcJob(`FIELDSEP_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job15.id, actorInspectorA);
    await qcService.submitChecklist(job15.id, [
      { id: mandatoryItem.id, result: "Failed", remark: "ITEM-LEVEL REMARK TEXT" },
    ], actorInspectorA);
    await db.job.update({ where: { id: job15.id }, data: { qcNotes: "PRE-EXISTING JOB QC NOTE" } });
    await qcService.decide(job15.id, { result: "Failed", reason: "OVERALL FAIL REASON TEXT", remarks: "OVERALL DECISION REMARKS TEXT" }, actorInspectorA);
    const job15Inspection = await db.qCInspection.findFirst({ where: { jobId: job15.id } });
    const job15Job = await db.job.findUnique({ where: { id: job15.id } });
    assert(job15Inspection?.reason === "OVERALL FAIL REASON TEXT", "QCInspection.reason holds exactly the overall Fail reason");
    assert(job15Inspection?.remarks === "OVERALL DECISION REMARKS TEXT", "QCInspection.remarks is independent of reason, unchanged by this phase");
    const job15Checklist = job15Inspection?.checklist as any[];
    assert(job15Checklist?.[0]?.remark === "ITEM-LEVEL REMARK TEXT", "Item-level checklist remark remains a separate field, untouched by the decision call");
    assert(job15Job?.qcNotes === "PRE-EXISTING JOB QC NOTE", "Job.qcNotes is completely untouched by the decision endpoint");

    // ========================================================================
    // GROUP 5 — Ownership precedence preserved (Phase 4B-3-B unchanged)
    // ========================================================================
    console.log(`\n[Group 5] Ownership check still precedes the new checklist/reason validation...`);

    console.log(`\n[Test 16] Non-owner is rejected for OWNERSHIP, not for the new reason/checklist rules...`);
    const job16 = await createReadyForQcJob(`OWNERPRECEDENCE_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job16.id, actorInspectorA); // A owns it
    await qcService.submitChecklist(job16.id, [{ id: mandatoryItem.id, result: "Failed", remark: "valid remark" }], actorInspectorA);
    errorCaught = false;
    try {
      // B is not the owner, sends an EMPTY reason on top — if ownership
      // didn't precede the new rule, this might surface a reason-required
      // error instead of (or in addition to) the ownership one.
      await qcService.decide(job16.id, { result: "Failed" } as any, actorInspectorB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not the assigned inspector"), "Non-owner rejection is the ownership error, not a reason/checklist error");
      assert(err.statusCode === 403, "Non-owner rejection is a 403 (ForbiddenError), confirming it fired before the 400-class checklist/reason checks");
    }
    assert(errorCaught, "Non-owner (B) is rejected before the new validation ever runs");
    const job16InspectionAfter = await db.qCInspection.findFirst({ where: { jobId: job16.id } });
    assert(job16InspectionAfter?.result === "Pending", "Non-owner's rejected attempt left the attempt untouched");

    console.log(`\n[Test 17] Owner (A) can still Fail the same attempt normally...`);
    const ownerFail16 = await qcService.decide(job16.id, { result: "Failed", reason: "Owner's real reason" }, actorInspectorA);
    assert(ownerFail16.status === "Rework Required", "Owner's own decide() call succeeds normally after the non-owner's rejected attempt");

    // ========================================================================
    // GROUP 6 — Idempotency / conflict preserved under the new rules
    // ========================================================================
    console.log(`\n[Group 6] Idempotency and conflict handling unaffected by the new rules...`);

    console.log(`\n[Test 18] Same-result retry remains idempotent even with a payload that would fail the NEW reason rule...`);
    const job18 = await setupSimpleJob(`IDEMPOTENT_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.decide(job18.id, { result: "Failed", reason: "Original reason" }, actorInspectorA);
    // Retry with NO reason at all — if the new rule applied to an
    // already-finalized attempt, this would incorrectly throw. It must not:
    // the attempt is no longer Pending, so the reason/checklist gate never
    // runs, and this falls straight through to the pre-existing
    // idempotent-same-result path.
    const idempotentRetry18 = await qcService.decide(job18.id, { result: "Failed" } as any, actorInspectorA);
    assert(idempotentRetry18.status === "Rework Required", "Idempotent retry (no reason this time) still succeeds — finalized attempts are exempt from the new rule");

    console.log(`\n[Test 19] Opposite-result conflict remains a conflict, not a checklist/reason error...`);
    const job19 = await setupSimpleJob(`CONFLICT_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.decide(job19.id, { result: "Passed" }, actorInspectorA);
    errorCaught = false;
    try {
      await qcService.decide(job19.id, { result: "Failed", reason: "trying to flip it" }, actorInspectorA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("already recorded"), "Opposite-result retry is still classified as a conflict, unaffected by the new rules");
    }
    assert(errorCaught, "A Passed attempt cannot be flipped to Failed after the fact");

    // ========================================================================
    // GROUP 7 — Job status / JobHistory semantics unchanged
    // ========================================================================
    console.log(`\n[Group 7] Job status / JobHistory semantics unchanged on success...`);

    console.log(`\n[Test 20] Successful Pass still produces the exact pre-existing side effects...`);
    const job20 = await setupSimpleJob(`SIDEEFFECTS_PASS_${Math.floor(1000 + Math.random() * 9000)}`);
    const passedJob20 = await qcService.decide(job20.id, { result: "Passed" }, actorInspectorA);
    assert(passedJob20.status === "Ready For Billing", "Pass still sets Job.status to Ready For Billing");
    assert(!!passedJob20.passedAt, "Pass still sets Job.passedAt");
    const job20History = await db.jobHistory.findFirst({ where: { jobId: job20.id, event: "QC_PASSED" } });
    assert(!!job20History, "Pass still creates exactly one QC_PASSED JobHistory row");

    console.log(`\n[Test 21] Successful Fail still produces the exact pre-existing side effects...`);
    const job21 = await createReadyForQcJob(`SIDEEFFECTS_FAIL_${Math.floor(1000 + Math.random() * 9000)}`);
    await qcService.getOrCreateOpenInspection(job21.id, actorInspectorA);
    await qcService.submitChecklist(job21.id, [{ id: mandatoryItem.id, result: "Failed", remark: "valid remark" }], actorInspectorA);
    const failedJob21 = await qcService.decide(job21.id, { result: "Failed", reason: "Confirmed defect" }, actorInspectorA);
    assert(failedJob21.status === "Rework Required", "Fail still sets Job.status to Rework Required");
    assert(failedJob21.isRework === true, "Fail still sets Job.isRework");
    assert(failedJob21.reworkCount === 1, "Fail still increments Job.reworkCount");
    const job21History = await db.jobHistory.findFirst({ where: { jobId: job21.id, event: "QC_FAILED" } });
    assert(!!job21History, "Fail still creates exactly one QC_FAILED JobHistory row");

  } finally {
    console.log(`\n[Clean Up] Cleaning up Phase 4B-3-C-A test data...`);
    await db.qCChecklistTemplateVersion.deleteMany({ where: { franchiseId: testFranchiseA.id } }).catch(() => {});
    await db.jobHistory.deleteMany({ where: { jobId: { contains: testRunId } } }).catch(() => {});
    await db.jobPhoto.deleteMany({ where: { franchiseId: testFranchiseA.id } }).catch(() => {});
    await db.qCInspection.deleteMany({ where: { franchiseId: testFranchiseA.id } }).catch(() => {});
    await db.qCChecklistTemplate.deleteMany({ where: { franchiseId: testFranchiseA.id } }).catch(() => {});
    await db.job.deleteMany({ where: { franchiseId: testFranchiseA.id } }).catch(() => {});
    await db.carIn.deleteMany({ where: { franchiseId: testFranchiseA.id } }).catch(() => {});
    await db.employee.deleteMany({ where: { franchiseId: testFranchiseA.id } }).catch(() => {});
    await db.franchise.deleteMany({ where: { id: testFranchiseA.id } }).catch(() => {});
    console.log(`Clean up completed.`);
  }

  console.log(`\n=======================================================`);
  console.log(`PHASE 4B-3-C-A TEST RESULTS SUMMARY:`);
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
