import { db } from '../src/lib/db.js';
import { JobCardService } from '../src/modules/job-card/service/job-card.service.js';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { InventoryService } from '../src/modules/inventory/service/inventory.service.js';
import { generateSequentialId } from '../src/shared/utils/idGenerator.js';
import { resolveDataScope } from '../src/shared/scope/dataScope.js';

const testRunId = `P3_${Date.now()}`;
console.log(`=======================================================`);
console.log(`STARTING PHASE 3 JOB + WORKSHOP LIFECYCLE TESTS`);
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
  const inventoryService = new InventoryService();

  // ── Fixture: inactive technician ID (cleaned up in finally) ─────────────
  const inactiveTechId = `${testRunId}_EMP_INACTIVE`;

  // Create Test Franchises
  const testFranchiseA = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_A`,
      name: "Phase 3 Test Branch A",
      city: "Chennai",
      owner: "Tester A",
      phone: "9111111111",
      since: new Date(),
      revenue: 0,
      jobs: 0,
      royaltyPct: 0,
      status: "Active"
    }
  });

  const testFranchiseB = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_B`,
      name: "Phase 3 Test Branch B",
      city: "Bangalore",
      owner: "Tester B",
      phone: "9222222222",
      since: new Date(),
      revenue: 0,
      jobs: 0,
      royaltyPct: 0,
      status: "Active"
    }
  });

  // Create Test Employees
  const testTechA = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_TECHA`,
      name: `Tech Alpha ${testRunId}`,
      role: "TECHNICIAN",
      phone: "9111110001",
      email: `techa_${testRunId}@test.com`,
      franchiseId: testFranchiseA.id,
      status: "Active"
    }
  });

  const testTechB = await db.employee.create({
    data: {
      id: `${testRunId}_EMP_TECHB`,
      name: `Tech Beta ${testRunId}`,
      role: "TECHNICIAN",
      phone: "9222220002",
      email: `techb_${testRunId}@test.com`,
      franchiseId: testFranchiseB.id,
      status: "Active"
    }
  });

  // Inactive technician — used in Group 6 assignment validation
  await db.employee.create({
    data: {
      id: inactiveTechId,
      name: `Inactive Tech ${testRunId}`,
      role: "TECHNICIAN",
      phone: "9111110099",
      email: `inactive_${testRunId}@test.com`,
      franchiseId: testFranchiseA.id,
      status: "Inactive"
    }
  });

  const testManagerA = {
    id: `${testRunId}_MGR_A`,
    name: "Manager Alpha",
    role: "BRANCH_MANAGER",
    franchiseId: testFranchiseA.id
  };

  const testManagerB = {
    id: `${testRunId}_MGR_B`,
    name: "Manager Beta",
    role: "BRANCH_MANAGER",
    franchiseId: testFranchiseB.id
  };

  const actorTechA = {
    id: testTechA.id,
    name: testTechA.name,
    role: "TECHNICIAN",
    franchiseId: testFranchiseA.id
  };

  try {
    // ------------------------------------------------------------------------
    // GROUP 1: JOB CREATION & 1-TO-1 CARIN IDEMPOTENCY
    // ------------------------------------------------------------------------
    console.log(`\n[Group 1] Testing Job Creation & 1-to-1 CarIn Idempotency...`);

    const checkin1 = await checkinService.createCheckin({
      vehicle: `TN 03 P3 ${Math.floor(1000 + Math.random() * 9000)}`,
      model: "Honda City",
      customer: "John Doe",
      phone: "9876543210",
      service: "Full Service",
      inTime: new Date().toISOString(),
      odometer: "45000",
      status: "Pending",
      notes: "Checkin test"
    }, testFranchiseA.id);

    assert(Boolean(checkin1.id), "CarIn record created");
    assert(Boolean(checkin1.jobCardId), "CarIn.jobCardId auto-populated");

    const job1 = await jobService.findScopedJob(checkin1.jobCardId, testManagerA);
    assert(job1.id === checkin1.jobCardId, "Job card found by ID");
    assert(job1.carInId === checkin1.id, "Job.carInId links back to CarIn.id");

    // Idempotent Job creation attempt with same carInId (sequential)
    const job1Idempotent = await jobService.createJob({
      vehicle: checkin1.vehicle,
      customer: checkin1.customer,
      service: checkin1.service,
      carInId: checkin1.id
    }, testManagerA);

    assert(job1Idempotent.id === job1.id, "Repeated createJob with same carInId returns exact existing Job instance");

    // Concurrent idempotency: 10 simultaneous createJob calls with the same carInId → exactly 1 Job
    console.log(`  [Group 1b] Testing 10 concurrent createJob calls with same carInId...`);
    const concurrentCarIn = await checkinService.createCheckin({
      vehicle: `TN 03 IDEM ${Math.floor(1000 + Math.random() * 9000)}`,
      model: "Toyota Etios",
      customer: "Idem Test",
      phone: "9800000001",
      service: "Oil Change",
      inTime: new Date().toISOString(),
      odometer: "10000",
      status: "Pending",
    }, testFranchiseA.id);

    const concIdempotentResults = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        jobService.createJob({
          vehicle: concurrentCarIn.vehicle,
          customer: concurrentCarIn.customer,
          service: concurrentCarIn.service,
          carInId: concurrentCarIn.id
        }, testManagerA)
      )
    );
    const uniqueJobIds = new Set(concIdempotentResults.map(j => j.id));
    assert(uniqueJobIds.size === 1, "10 concurrent createJob calls with same carInId resolve to exactly 1 Job");
    assert(concIdempotentResults[0].id === concurrentCarIn.jobCardId, "All callers resolve to the carIn-linked Job");

    // ------------------------------------------------------------------------
    // GROUP 2: JOB NUMBER CONCURRENCY (DB SEQUENCE PROTECTION)
    // ------------------------------------------------------------------------
    console.log(`\n[Group 2] Testing Concurrent Job Number Allocation (20 Requests)...`);

    const createPromises = Array.from({ length: 20 }).map((_, idx) =>
      jobService.createJob({
        vehicle: `TN 03 CC ${1000 + idx}`,
        customer: `Concurrent Customer ${idx}`,
        service: "General Maintenance",
        status: "Pending"
      }, testManagerA)
    );

    const concurrentJobs = await Promise.all(createPromises);
    assert(concurrentJobs.length === 20, "All 20 concurrent Job creation requests succeeded");

    const createdIds = new Set(concurrentJobs.map(j => j.id));
    assert(createdIds.size === 20, "All 20 generated Job IDs are completely unique (0 duplicates)");

    // ------------------------------------------------------------------------
    // GROUP 3: INVALID STATUS JUMP & QC STATUS REJECTIONS
    // ------------------------------------------------------------------------
    console.log(`\n[Group 3] Testing Invalid Status Transition Rejections...`);

    const jobToTestJumps = concurrentJobs[0];

    // Attempt direct jump from Pending to Work Completed
    let errorCaught = false;
    try {
      await jobService.updateJob(jobToTestJumps.id, { status: "Work Completed" }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("Work must be in progress"), "Direct jump from Pending to Work Completed blocked");
    }
    assert(errorCaught, "Error caught on invalid direct status jump");

    // Attempt setting QC-controlled status via updateJob
    errorCaught = false;
    try {
      await jobService.updateJob(jobToTestJumps.id, { status: "QC Passed" }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("QC-controlled status"), "Setting QC-controlled status via generic update blocked");
    }
    assert(errorCaught, "Error caught on QC status override attempt");

    // ------------------------------------------------------------------------
    // GROUP 4: VEHICLE INSPECTION GATE — EXACT SEMANTICS VERIFICATION
    // ------------------------------------------------------------------------
    console.log(`\n[Group 4] Testing Vehicle Inspection Gate & Exact Semantics...`);

    const checkinNoInspection = await checkinService.createCheckin({
      vehicle: `TN 03 GATE ${Math.floor(1000 + Math.random() * 9000)}`,
      model: "Maruti Swift",
      customer: "Alice Smith",
      phone: "9876543211",
      service: "Oil Change",
      inTime: new Date().toISOString(),
      odometer: "20000",
      status: "Pending"
    }, testFranchiseA.id);

    const jobGate = await jobService.findScopedJob(checkinNoInspection.jobCardId, testManagerA);

    // Case A: No condition, no photo → BLOCKED
    errorCaught = false;
    try {
      await jobService.updateJob(jobGate.id, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("inspection details and at least one vehicle photograph"), "Transition to WIP blocked without inspection");
    }
    assert(errorCaught, "Inspection gate enforced (no condition, no photo)");

    // Case B: Photo only, NO condition field → BLOCKED
    await db.carIn.update({
      where: { id: checkinNoInspection.id },
      data: { scratches: null, dents: null, interiorCondition: null, photoFront: "https://cdn.shifterz.com/photos/front.jpg" }
    });
    errorCaught = false;
    try {
      await jobService.updateJob(jobGate.id, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("inspection details"), "Photo-only (no condition field) blocks WIP transition");
    }
    assert(errorCaught, "Case B: photo-only blocked");

    // Case C: Condition field only, NO photo → BLOCKED
    await db.carIn.update({
      where: { id: checkinNoInspection.id },
      data: { scratches: "Scratch on door", photoFront: null }
    });
    errorCaught = false;
    try {
      await jobService.updateJob(jobGate.id, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("vehicle photograph"), "Condition-only (no photo) blocks WIP transition");
    }
    assert(errorCaught, "Case C: condition-only blocked");

    // Case D: Empty string condition + photo → BLOCKED (empty string is falsy)
    await db.carIn.update({
      where: { id: checkinNoInspection.id },
      data: { scratches: "", dents: "", interiorCondition: "", photoFront: "https://cdn.shifterz.com/photos/front.jpg" }
    });
    errorCaught = false;
    try {
      await jobService.updateJob(jobGate.id, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("inspection details"), "Empty string condition field does not satisfy inspection requirement");
    }
    assert(errorCaught, "Case D: empty string condition blocked");

    // Case E: Valid condition + valid photo → ALLOWED
    await db.carIn.update({
      where: { id: checkinNoInspection.id },
      data: {
        scratches: "Front left bumper scratch",
        dents: "None",
        interiorCondition: "Clean",
        photoFront: "https://cdn.shifterz.com/photos/front.jpg"
      }
    });

    const updatedJobGate = await jobService.updateJob(jobGate.id, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    assert(updatedJobGate.status === "Work In Progress", "Case E: valid condition + photo → WIP transition allowed");

    // ------------------------------------------------------------------------
    // GROUP 5: ESTIMATE APPROVAL GATE + NO-ESTIMATE BUSINESS RULE
    // ------------------------------------------------------------------------
    console.log(`\n[Group 5] Testing Estimate Approval Gate & No-Estimate Rule...`);

    // Group 5a: No estimate at all → ALLOWED (Option B: Estimate is optional)
    // The db.estimate is created manually by service advisors; NOT auto-generated from CarIn.
    // Business rule: No estimate present → work is allowed (standard maintenance workflow).
    const checkinNoEst = await checkinService.createCheckin({
      vehicle: `TN 03 NOEST ${Math.floor(1000 + Math.random() * 9000)}`,
      model: "Tata Nexon",
      customer: "NoEst Customer",
      phone: "9800000099",
      service: "Tyre Rotation",
      inTime: new Date().toISOString(),
      odometer: "15000",
      status: "Pending"
    }, testFranchiseA.id);

    // Add inspection so the only variable is the estimate
    await db.carIn.update({
      where: { id: checkinNoEst.id },
      data: {
        scratches: "None",
        photoFront: "https://cdn.shifterz.com/photos/noest.jpg"
      }
    });

    const jobNoEst = await jobService.findScopedJob(checkinNoEst.jobCardId, testManagerA);

    // Confirm zero estimates exist for this vehicle
    const estCountForNoEstVehicle = await db.estimate.count({
      where: { vehicle: checkinNoEst.vehicle, isDeleted: false }
    });
    assert(estCountForNoEstVehicle === 0, "Group 5a: No estimates exist for this vehicle");

    // Attempt WIP — should SUCCEED (Option B: no estimate = allowed)
    const jobNoEstWip = await jobService.updateJob(jobNoEst.id, {
      status: "Work In Progress",
      technicianId: testTechA.id
    }, testManagerA);
    assert(jobNoEstWip.status === "Work In Progress", "Group 5a: Job with zero estimates transitions to WIP (no-estimate is ALLOWED per Option B)");

    // Group 5b: Pending estimate → BLOCKED
    const checkinEst = await checkinService.createCheckin({
      vehicle: `TN 03 EST ${Math.floor(1000 + Math.random() * 9000)}`,
      model: "Hyundai Creta",
      customer: "Bob Brown",
      phone: "9876543212",
      service: "Brake Service",
      inTime: new Date().toISOString(),
      odometer: "30000",
      status: "Pending",
      scratches: "Minor bumper mark",
      photoFront: "https://cdn.shifterz.com/photo.jpg"
    }, testFranchiseA.id);

    // Create a Pending estimate for this vehicle
    const estPending = await db.estimate.create({
      data: {
        id: `EST_${Date.now()}_1`,
        customerName: checkinEst.customer,
        phone: checkinEst.phone,
        vehicle: checkinEst.vehicle,
        model: checkinEst.model,
        amount: 5000,
        status: "Pending",
        franchiseId: testFranchiseA.id
      }
    });

    const jobEst = await jobService.findScopedJob(checkinEst.jobCardId, testManagerA);

    // Attempt transition to Work In Progress with unapproved estimate
    errorCaught = false;
    try {
      await jobService.updateJob(jobEst.id, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("estimate exists for vehicle") && err.message.includes("not approved"), "Transition blocked by unapproved Estimate");
    }
    assert(errorCaught, "Group 5b: Estimate approval gate enforced (Pending estimate blocks WIP)");

    // Group 5c: Rejected estimate → BLOCKED
    await db.estimate.update({ where: { id: estPending.id }, data: { status: "Rejected" } });
    errorCaught = false;
    try {
      await jobService.updateJob(jobEst.id, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not approved"), "Transition blocked by Rejected Estimate");
    }
    assert(errorCaught, "Group 5c: Rejected estimate blocks WIP");

    // Approve the Estimate
    await db.estimate.update({
      where: { id: estPending.id },
      data: { status: "Approved" }
    });

    // Retry transition → success
    const jobEstApproved = await jobService.updateJob(jobEst.id, { status: "Work In Progress", technicianId: testTechA.id }, testManagerA);
    assert(jobEstApproved.status === "Work In Progress", "Group 5d: Transition succeeded after Estimate status set to 'Approved'");

    // ------------------------------------------------------------------------
    // GROUP 6: EMPLOYEE & TECHNICIAN ASSIGNMENT RULES (+ INACTIVE TECH)
    // ------------------------------------------------------------------------
    console.log(`\n[Group 6] Testing Employee & Technician Assignment Rules...`);

    // Valid technician assignment
    const jobTechAssign = await jobService.updateJob(jobEst.id, { technicianId: testTechA.id, technician: testTechA.name }, testManagerA);
    assert(jobTechAssign.technicianId === testTechA.id, "Valid Active technician assigned to Job");

    // Assigning non-existent employee ID
    errorCaught = false;
    try {
      await jobService.updateJob(jobEst.id, { technicianId: "NON_EXISTENT_EMP" }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(
        err.message.includes("Assigned technician not found") || err.message.includes("not active"),
        "Non-existent technician assignment rejected"
      );
    }
    assert(errorCaught, "Invalid technician ID rejected");

    // Assigning INACTIVE technician from Franchise A → BLOCKED
    errorCaught = false;
    try {
      await jobService.updateJob(jobEst.id, { technicianId: inactiveTechId }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(
        err.message.includes("not active") || err.message.includes("not found"),
        "Inactive technician assignment rejected"
      );
    }
    assert(errorCaught, "Inactive technician blocked from assignment");

    // Assigning technician from Franchise B to Franchise A job
    errorCaught = false;
    try {
      await jobService.updateJob(jobEst.id, { technicianId: testTechB.id }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("does not belong to your franchise"), "Cross-franchise technician assignment rejected");
    }
    assert(errorCaught, "Cross-franchise technician assignment blocked");

    // Assignment lock by HQ
    await db.job.update({
      where: { id: jobEst.id },
      data: { assignmentLocked: true, assignedBy: "HQ_ADMIN", assignedByRole: "SUPER_ADMIN" }
    });

    errorCaught = false;
    try {
      await jobService.updateJob(jobEst.id, { technician: "Different Tech Name" }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("assignment is locked by HQ"), "Franchise modification of HQ-locked assignment blocked");
    }
    assert(errorCaught, "HQ assignment lock enforced");

    // Unlock job for subsequent tests
    await db.job.update({
      where: { id: jobEst.id },
      data: { assignmentLocked: false }
    });

    // ------------------------------------------------------------------------
    // GROUP 7: ADDITIONAL WORK RULES & COMPLETION BLOCKING
    // ------------------------------------------------------------------------
    console.log(`\n[Group 7] Testing Additional Work Rules & Completion Blocking...`);

    const addWork1 = await jobService.requestAdditionalWork(jobEst.id, {
      description: "Replace Rear Brake Pads",
      estimatedCost: 2500
    }, actorTechA);

    assert(addWork1.status === "Pending", "Additional work requested with status 'Pending'");

    // Pending AdditionalWork → blocks completion
    errorCaught = false;
    try {
      await jobService.requestCompletion(jobEst.id, actorTechA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("pending additional work requests exist"), "Completion blocked by pending Additional Work");
    }
    assert(errorCaught, "Pending Additional Work completion gate enforced");

    // Attempt approving additional work without customer approval flag
    errorCaught = false;
    try {
      await jobService.resolveAdditionalWork(addWork1.id, { status: "Approved", customerApproved: false }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("Customer approval must be confirmed"), "Approval blocked without customer approval");
    }
    assert(errorCaught, "Customer approval required for Additional Work");

    // Approve with customer approval = true
    const approvedAddWork = await jobService.resolveAdditionalWork(addWork1.id, { status: "Approved", customerApproved: true }, testManagerA);
    assert(approvedAddWork?.status === "Approved" && approvedAddWork?.customerApproved === true, "Additional Work approved with customer approval confirmed");

    // Approved AdditionalWork does NOT block completion (by design — see service comment)
    // (Completion will be tested after material gates are clear in Group 10)
    // Additional Work completion model:
    //   status = 'Approved' → customer-authorized, assumed performed at job completion
    //   No separate 'Completed' state exists. Only 'Pending' blocks completion.
    assert(approvedAddWork?.status === "Approved", "Approved additional work does not block completion (only Pending does)");

    // Request a second piece of additional work and REJECT it — to verify REJECTED event + no completion block
    const addWork2 = await jobService.requestAdditionalWork(jobEst.id, {
      description: "Wiper Replacement (rejected)",
      estimatedCost: 500
    }, actorTechA);
    assert(addWork2.status === "Pending", "Second additional work created as Pending");

    const rejectedAddWork = await jobService.resolveAdditionalWork(addWork2.id, { status: "Rejected", rejectionNote: "Not needed" }, testManagerA);
    assert(rejectedAddWork?.status === "Rejected", "Additional Work rejected successfully");

    // ------------------------------------------------------------------------
    // GROUP 8: MATERIAL CONSUMPTION RULES, ATOMIC APPROVAL & IDEMPOTENCY
    // ------------------------------------------------------------------------
    console.log(`\n[Group 8] Testing Material Consumption Rules, Atomic DB Approval & Idempotency...`);

    // Create Test Inventory Items
    const invItem1 = await db.inventory.create({
      data: {
        id: `${testRunId}_INV_1`,
        name: "Engine Oil 5W30",
        unit: "Liters",
        category: "Fluids",
        stock: 10,
        reorder: 2,
        cost: 400,
        supplier: "Test Supplier",
        location: "Rack A",
        franchiseId: testFranchiseA.id
      }
    });

    const matReq1 = await jobService.recordMaterialConsumption(jobEst.id, {
      itemId: invItem1.id,
      quantity: 4
    }, actorTechA);

    assert(matReq1.status === "Pending", "Material consumption recorded with status 'Pending'");

    // Attempt completion while material consumption is Pending
    errorCaught = false;
    try {
      await jobService.requestCompletion(jobEst.id, actorTechA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("pending material consumption requests exist"), "Completion blocked by pending Material Consumption");
    }
    assert(errorCaught, "Pending Material Consumption completion gate enforced");

    // Oversell attempt: record 50 units (stock is 10) → approval must ROLLBACK
    const matOversell = await jobService.recordMaterialConsumption(jobEst.id, {
      itemId: invItem1.id,
      quantity: 50
    }, actorTechA);

    errorCaught = false;
    try {
      await jobService.resolveMaterialConsumption(matOversell.id, { status: "Approved" }, testManagerA);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("Insufficient stock"), "Oversell material approval rejected");
    }
    assert(errorCaught, "Stock oversell protection enforced");

    // Verify oversell record status rolled back to Pending in DB
    const oversellCheck = await db.materialConsumption.findUnique({ where: { id: matOversell.id } });
    assert(oversellCheck?.status === "Pending", "Oversell transaction rolled back status to 'Pending'");

    // Verify stock unchanged after failed oversell
    const stockAfterOversellFail = await db.inventory.findUnique({ where: { id: invItem1.id } });
    assert(stockAfterOversellFail?.stock === 10, "Stock unchanged after failed oversell approval (still 10)");

    // Valid material approval (4 units of 10)
    const approvedMat1 = await jobService.resolveMaterialConsumption(matReq1.id, { status: "Approved" }, testManagerA);
    assert(approvedMat1.status === "Approved", "Material consumption approved successfully (first call)");

    const updatedInv1 = await db.inventory.findUnique({ where: { id: invItem1.id } });
    assert(updatedInv1?.stock === 6, "Inventory stock atomically decremented from 10 to 6 after first approval");

    // ── IDEMPOTENCY TEST: re-approve same record → return as-is, NO second stock decrement ──
    const idempotentRetry = await jobService.resolveMaterialConsumption(matReq1.id, { status: "Approved" }, testManagerA);
    assert(idempotentRetry.status === "Approved", "Idempotent retry: re-approving Approved record returns existing Approved result");

    const stockAfterIdempotentRetry = await db.inventory.findUnique({ where: { id: invItem1.id } });
    assert(stockAfterIdempotentRetry?.stock === 6, "Idempotent retry: stock unchanged (still 6, NOT decremented again)");

    // Reject oversell request to clear pending status
    await jobService.resolveMaterialConsumption(matOversell.id, { status: "Rejected", rejectionNote: "Excessive quantity" }, testManagerA);
    const rejectedOversell = await db.materialConsumption.findUnique({ where: { id: matOversell.id } });
    assert(rejectedOversell?.status === "Rejected", "Oversell request rejected successfully");

    // ------------------------------------------------------------------------
    // GROUP 9: 10 CONCURRENT MATERIAL CONSUMPTION APPROVALS
    // ------------------------------------------------------------------------
    console.log(`\n[Group 9] Testing 10 Concurrent Material Consumption Approvals...`);

    const invItems = await Promise.all(
      Array.from({ length: 10 }).map((_, i) =>
        db.inventory.create({
          data: {
            id: `${testRunId}_INV_CONC_${i}`,
            name: `Spare Part ${i}`,
            unit: "Pcs",
            category: "Parts",
            stock: 20,
            reorder: 2,
            cost: 100,
            supplier: "Test Supplier",
            location: "Rack B",
            franchiseId: testFranchiseA.id
          }
        })
      )
    );

    const matRecords = await Promise.all(
      invItems.map(item =>
        jobService.recordMaterialConsumption(jobEst.id, { itemId: item.id, quantity: 2 }, actorTechA)
      )
    );

    const resolvePromises = matRecords.map(rec =>
      jobService.resolveMaterialConsumption(rec.id, { status: "Approved" }, testManagerA)
    );

    const resolvedResults = await Promise.all(resolvePromises);
    assert(resolvedResults.length === 10, "All 10 concurrent material consumption approvals succeeded");
    assert(resolvedResults.every(r => r.status === "Approved"), "All 10 material consumptions transitioned to 'Approved'");

    const verifyStocks = await Promise.all(invItems.map(item => db.inventory.findUnique({ where: { id: item.id } })));
    assert(verifyStocks.every(s => s?.stock === 18), "All 10 inventory items were atomically decremented from 20 to 18");

    // ------------------------------------------------------------------------
    // GROUP 10: WORK COMPLETION GATE & COMPLETE WORKFLOW
    // ------------------------------------------------------------------------
    console.log(`\n[Group 10] Testing Work Completion Gate & Workflow...`);

    const completedJob = await jobService.requestCompletion(jobEst.id, actorTechA);
    assert(completedJob.status === "Waiting for Quality Check", "Job status transitioned to 'Waiting for Quality Check'");
    assert(Boolean(completedJob.actualCompletion), "Job actualCompletion timestamp populated");

    // ------------------------------------------------------------------------
    // GROUP 11: JOBHISTORY LIFECYCLE EVENTS
    // ------------------------------------------------------------------------
    console.log(`\n[Group 11] Testing JobHistory Lifecycle Events...`);

    const history = await jobService.getJobHistory(jobEst.id, testManagerA);
    assert(history.length >= 6, "JobHistory contains at least 6 lifecycle events");

    const events = history.map(h => h.event);

    // Core events
    assert(events.includes("CREATED"), "JobHistory contains 'CREATED' event");
    assert(events.includes("STATUS_CHANGED"), "JobHistory contains 'STATUS_CHANGED' event");
    assert(events.includes("EMPLOYEE_ASSIGNED"), "JobHistory contains 'EMPLOYEE_ASSIGNED' event");

    // New semantic events added in Phase 3 closure
    assert(events.includes("WORK_STARTED"), "JobHistory contains 'WORK_STARTED' event");
    assert(events.includes("INSPECTION_COMPLETED"), "JobHistory contains 'INSPECTION_COMPLETED' event (emitted when inspection gate passed)");
    assert(events.includes("WORK_COMPLETED"), "JobHistory contains 'WORK_COMPLETED' event");

    // Material & additional work events
    assert(events.includes("ADDITIONAL_WORK_APPROVED"), "JobHistory contains 'ADDITIONAL_WORK_APPROVED' event");
    assert(events.includes("ADDITIONAL_WORK_REJECTED"), "JobHistory contains 'ADDITIONAL_WORK_REJECTED' event");
    assert(events.includes("MATERIAL_CONSUMED"), "JobHistory contains 'MATERIAL_CONSUMED' event");

    // Payload verification for WORK_STARTED
    const workStartedEvent = history.find(h => h.event === "WORK_STARTED");
    assert(Boolean(workStartedEvent?.payload), "WORK_STARTED event has a payload");

    // Payload verification for WORK_COMPLETED
    const workCompletedEvent = history.find(h => h.event === "WORK_COMPLETED");
    assert(Boolean(workCompletedEvent?.payload), "WORK_COMPLETED event has a payload");

    // Payload verification for INSPECTION_COMPLETED
    const inspectionEvent = history.find(h => h.event === "INSPECTION_COMPLETED");
    assert(Boolean((inspectionEvent?.payload as any)?.carInId), "INSPECTION_COMPLETED event contains carInId in payload");

    // ------------------------------------------------------------------------
    // GROUP 12: CROSS-FRANCHISE TENANT ISOLATION
    // ------------------------------------------------------------------------
    console.log(`\n[Group 12] Testing Cross-Franchise Tenant Isolation...`);

    // Manager B trying to access Franchise A Job
    errorCaught = false;
    try {
      await jobService.findScopedJob(jobEst.id, testManagerB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("Job card not found"), "Franchise B manager cannot view Franchise A job (returns 404)");
    }
    assert(errorCaught, "Cross-franchise read isolation enforced");

    // Manager B trying to resolve Franchise A material consumption (already Approved — idempotent returns as-is, not a cross-franchise leak test)
    // Use a dedicated pending item owned by franchise A
    const isoInvItem = await db.inventory.create({
      data: {
        id: `${testRunId}_INV_ISO`,
        name: "ISO Test Part",
        unit: "Pcs",
        category: "Parts",
        stock: 5,
        reorder: 1,
        cost: 50,
        supplier: "ISO Supplier",
        location: "Rack ISO",
        franchiseId: testFranchiseA.id
      }
    });
    const isoMatReq = await jobService.recordMaterialConsumption(jobEst.id, { itemId: isoInvItem.id, quantity: 1 }, actorTechA);

    errorCaught = false;
    try {
      await jobService.resolveMaterialConsumption(isoMatReq.id, { status: "Rejected" }, testManagerB);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes("not found") || err.message.includes("unauthorized"), "Franchise B manager cannot resolve Franchise A material consumption");
    }
    assert(errorCaught, "Cross-franchise mutation isolation enforced");

    // HQ / SUPER_ADMIN can access both franchises
    const hqActor = { id: "HQ_TEST", name: "HQ Admin", role: "SUPER_ADMIN", franchiseId: undefined };
    const jobFromHq = await jobService.findScopedJob(jobEst.id, hqActor);
    assert(jobFromHq.id === jobEst.id, "HQ (SUPER_ADMIN) can access Franchise A job");

    // Clean up iso isolation test material
    await db.materialConsumption.deleteMany({ where: { id: isoMatReq.id } }).catch(() => {});
    await db.inventory.deleteMany({ where: { id: isoInvItem.id } }).catch(() => {});

  } finally {
    // Cleanup Test Data
    console.log(`\n[Clean Up] Cleaning up Phase 3 test data...`);
    await db.jobHistory.deleteMany({ where: { jobId: { contains: testRunId } } }).catch(() => {});
    await db.additionalWork.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.materialConsumption.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.job.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.carIn.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.estimate.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.inventory.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.employee.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    await db.franchise.deleteMany({ where: { id: { in: [testFranchiseA.id, testFranchiseB.id] } } }).catch(() => {});
    console.log(`Clean up completed.`);
  }

  console.log(`\n=======================================================`);
  console.log(`PHASE 3 TEST RESULTS SUMMARY:`);
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
