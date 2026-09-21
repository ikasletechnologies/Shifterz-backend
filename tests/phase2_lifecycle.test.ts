import { db } from '../src/lib/db.js';
import { LeadService } from '../src/modules/lead/service/lead.service.ts';
import { CustomerService } from '../src/modules/customer/service/customer.service.ts';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.ts';
import { ReferralService } from '../src/modules/lead/service/referral.service.ts';
import { generateSequentialId } from '../src/shared/utils/idGenerator.ts';
import { normalizeVehicleNo } from '../src/shared/utils/vehicleUtils.ts';
import { resolveDataScope, scopeWhere } from '../src/shared/scope/dataScope.ts';

const testRunId = `P2_${Date.now()}`;
console.log(`=======================================================`);
console.log(`STARTING PHASE 2 AUTOMATED INTEGRATION & CONCURRENCY TESTS`);
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
  const leadService = new LeadService();
  const customerService = new CustomerService();
  const checkinService = new VehicleCheckinService();
  const referralService = new ReferralService();

  // Test Franchise setup
  const testFranchiseA = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_A`,
      name: "Phase 2 Test Branch A",
      city: "Chennai",
      owner: "Tester A",
      phone: "9000000001",
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
      name: "Phase 2 Test Branch B",
      city: "Bangalore",
      owner: "Tester B",
      phone: "9000000002",
      since: new Date(),
      revenue: 0,
      jobs: 0,
      royaltyPct: 0,
      status: "Active"
    }
  });

  try {
    // ------------------------------------------------------------------------
    // SECTION 1: LEAD → CUSTOMER CONVERSION & CONCURRENCY
    // ------------------------------------------------------------------------
    console.log(`\n[1] Testing Lead → Customer Conversion...`);
    
    // Normal Conversion
    const lead1 = await leadService.createLead({
      name: `Lead Normal ${testRunId}`,
      phone: `98881${Math.floor(10000 + Math.random() * 90000)}`,
      email: `lead1_${testRunId}@example.com`,
      service: "General Service",
      vehicle: "TN 01 AB 1111",
      vehicleMake: "Hyundai",
      vehicleModel: "i20",
      status: "New",
      notes: "Normal conversion test",
      budget: "10000"
    }, testFranchiseA.id);

    const cust1 = await leadService.convertLead(lead1.id);
    assert(cust1 !== null && cust1 !== undefined, "Customer created from lead conversion");

    const updatedLead1 = await db.lead.findUnique({ where: { id: lead1.id } });
    assert(updatedLead1?.customerId === cust1.id, "Lead.customerId links to Customer.id");
    assert(cust1.convertedLeadId === lead1.id, "Customer.convertedLeadId links back to Lead.id");
    assert(updatedLead1?.status === "Converted", "Lead status set to 'Converted'");

    // Double Conversion (Idempotency)
    console.log(`  Testing Double Conversion (Idempotency)...`);
    const cust1Again = await leadService.convertLead(lead1.id);
    assert(cust1Again.id === cust1.id, "Second conversion returns exact same Customer instance");

    // Concurrent Conversion
    console.log(`  Testing Concurrent Conversion...`);
    const lead2 = await leadService.createLead({
      name: `Lead Concurrent ${testRunId}`,
      phone: `98882${Math.floor(10000 + Math.random() * 90000)}`,
      email: `lead2_${testRunId}@example.com`,
      service: "Paint Protection",
      vehicle: "TN 02 CD 2222",
      status: "New",
      notes: "Concurrent conversion test",
      budget: "25000"
    }, testFranchiseA.id);

    const [concRes1, concRes2] = await Promise.all([
      leadService.convertLead(lead2.id),
      leadService.convertLead(lead2.id)
    ]);
    assert(concRes1.id === concRes2.id, "Concurrent conversion returns same single Customer instance");
    
    const customersForLead2 = await db.customer.findMany({ where: { convertedLeadId: lead2.id } });
    assert(customersForLead2.length === 1, "Exactly ONE Customer created for concurrent conversion");

    // Existing Customer Reuse on Conversion
    console.log(`  Testing Existing Customer Reuse on Lead Conversion...`);
    const sharedPhone = `98883${Math.floor(10000 + Math.random() * 90000)}`;
    const existingCust = await customerService.createCustomer({
      name: `Pre-existing Customer ${testRunId}`,
      phone: sharedPhone,
      email: `existing_${testRunId}@example.com`
    }, testFranchiseA.id);

    const lead3 = await leadService.createLead({
      name: `Lead for Existing Cust ${testRunId}`,
      phone: sharedPhone,
      service: "Ceramic Coating",
      vehicle: "TN 03 EF 3333",
      status: "New",
      notes: "Lead matching existing customer phone"
    }, testFranchiseA.id);

    const convertedLead3Cust = await leadService.convertLead(lead3.id);
    assert(convertedLead3Cust.id === existingCust.id, "Existing Customer reused by phone match");

    const totalCustsWithPhone = await db.customer.findMany({ where: { phone: sharedPhone } });
    assert(totalCustsWithPhone.length === 1, "No duplicate Customer master created");


    // ------------------------------------------------------------------------
    // SECTION 2: LEAD STATUS UPDATE / CUSTOMER PRESERVATION
    // ------------------------------------------------------------------------
    console.log(`\n[2] Testing Lead Status Update Customer Preservation...`);
    const zeroVisitPhone = `98884${Math.floor(10000 + Math.random() * 90000)}`;
    const zeroVisitCust = await customerService.createCustomer({
      name: `Zero Visit Customer ${testRunId}`,
      phone: zeroVisitPhone,
      email: `zerovisit_${testRunId}@example.com`
    }, testFranchiseA.id);

    const leadForPreserve = await leadService.createLead({
      name: `Lead for Preserve ${testRunId}`,
      phone: zeroVisitPhone,
      service: "Washing",
      vehicle: "TN 04 GH 4444",
      status: "New",
      notes: "Testing preservation on status change"
    }, testFranchiseA.id);

    // Update lead status to Contacted (non-converted)
    await leadService.updateLead(leadForPreserve.id, {
      ...leadForPreserve,
      status: "Contacted",
      notes: "Updated status to Contacted"
    });

    const checkZeroVisitCust = await db.customer.findUnique({ where: { id: zeroVisitCust.id } });
    assert(checkZeroVisitCust !== null && !checkZeroVisitCust.isDeleted, "0-visit Customer is NOT deleted on non-conversion lead update");


    // ------------------------------------------------------------------------
    // SECTION 3 & 4: CUSTOMER DUPLICATE PROTECTION & CONCURRENCY
    // ------------------------------------------------------------------------
    console.log(`\n[3 & 4] Testing Customer Duplicate Protection & Concurrent Creation...`);
    const dupTestPhone = `98885${Math.floor(10000 + Math.random() * 90000)}`;
    
    const custA = await customerService.createCustomer({
      name: `Duplicate Test Master ${testRunId}`,
      phone: dupTestPhone,
      email: `dup1_${testRunId}@example.com`
    }, testFranchiseA.id);

    const custB = await customerService.createCustomer({
      name: `Duplicate Test Second Call ${testRunId}`,
      phone: dupTestPhone,
      email: `dup2_${testRunId}@example.com`
    }, testFranchiseA.id);

    assert(custA.id === custB.id, "Sequential duplicate createCustomer calls return existing master record");

    // Concurrent Customer Creation
    console.log(`  Testing Concurrent Customer Creation...`);
    const concPhone = `98886${Math.floor(10000 + Math.random() * 90000)}`;
    const [concCust1, concCust2] = await Promise.all([
      customerService.createCustomer({ name: `Conc Cust 1`, phone: concPhone }, testFranchiseA.id),
      customerService.createCustomer({ name: `Conc Cust 2`, phone: concPhone }, testFranchiseA.id)
    ]);

    assert(concCust1.id === concCust2.id, "Concurrent createCustomer requests resolve to single Customer record");
    const countForConcPhone = await db.customer.count({ where: { phone: concPhone } });
    assert(countForConcPhone === 1, "Exactly ONE Customer record in database for concurrent creation");


    // ------------------------------------------------------------------------
    // SECTION 5: CUSTOMER ID GENERATION & CONCURRENCY
    // ------------------------------------------------------------------------
    console.log(`\n[5] Testing Customer ID Generation Under Concurrency (20 concurrent calls)...`);
    const idPromises = Array.from({ length: 20 }).map((_, i) => 
      customerService.createCustomer({
        name: `High Conc Customer ${i}_${testRunId}`,
        phone: `9777${i.toString().padStart(2, '0')}${Math.floor(10000 + Math.random() * 90000)}`
      }, testFranchiseA.id)
    );

    const generatedCusts = await Promise.all(idPromises);
    const generatedIds = generatedCusts.map(c => c.id);
    const uniqueIds = new Set(generatedIds);

    assert(generatedIds.length === 20, "Generated 20 customer records");
    assert(uniqueIds.size === 20, "All 20 generated customer IDs are strictly unique (0 collisions)");
    assert(generatedIds[0].startsWith("CUS-"), `ID format starts with CUS- (sample: ${generatedIds[0]})`);


    // ------------------------------------------------------------------------
    // SECTION 6: VEHICLE NORMALIZATION
    // ------------------------------------------------------------------------
    console.log(`\n[6] Testing Vehicle Registration Normalization...`);
    assert(normalizeVehicleNo("tn 01 ab 1234") === "TN01AB1234", "tn 01 ab 1234 -> TN01AB1234");
    assert(normalizeVehicleNo("TN 01 AB 1234") === "TN01AB1234", "TN 01 AB 1234 -> TN01AB1234");
    assert(normalizeVehicleNo("TN-01-AB-1234") === "TN01AB1234", "TN-01-AB-1234 -> TN01AB1234");
    assert(normalizeVehicleNo("tn01ab1234") === "TN01AB1234", "tn01ab1234 -> TN01AB1234");


    // ------------------------------------------------------------------------
    // SECTION 7 & 8: VEHICLE DUPLICATE PROTECTION & OWNERSHIP TRANSFER
    // ------------------------------------------------------------------------
    console.log(`\n[7 & 8] Testing Vehicle Duplicate Protection & Ownership Transfer...`);
    const ownerA = await customerService.createCustomer({
      name: `Owner A ${testRunId}`,
      phone: `96661${Math.floor(10000 + Math.random() * 90000)}`
    }, testFranchiseA.id);

    const ownerB = await customerService.createCustomer({
      name: `Owner B ${testRunId}`,
      phone: `96662${Math.floor(10000 + Math.random() * 90000)}`
    }, testFranchiseA.id);

    const testVehNoRaw = "tn-09-xy-9999";
    const testVehNoNorm = "TN09XY9999";

    // Add Vehicle under Owner A
    const vehA = await customerService.addVehicle(ownerA.id, {
      vehicleNo: testVehNoRaw,
      make: "Toyota",
      model: "Innova",
      odometer: 10000
    });
    assert(vehA.vehicleNo === testVehNoNorm, "Vehicle stored in canonical normalized uppercase format");
    assert(vehA.customerId === ownerA.id, "Vehicle initially owned by Owner A");

    // Create Historical Job Card for Vehicle under Owner A
    const historicalJob = await db.job.create({
      data: {
        id: `JOB_HIST_${testRunId}`,
        vehicle: testVehNoNorm,
        customer: ownerA.name,
        service: "Full Service",
        technician: "Tech 1",
        status: "Delivered",
        priority: "Medium",
        startDate: new Date(),
        estCompletion: new Date(),
        notes: "Historical service for Owner A",
        franchiseId: testFranchiseA.id
      }
    });

    // Transfer Vehicle to Owner B
    console.log(`  Executing Ownership Transfer to Owner B...`);
    const transferredVeh = await customerService.addVehicle(ownerB.id, {
      vehicleNo: testVehNoNorm,
      make: "Toyota",
      model: "Innova",
      odometer: 12000
    });

    assert(transferredVeh.customerId === ownerB.id, "Vehicle ownership successfully transferred to Owner B");
    
    // Verify Owner A's historical job remains intact
    const checkHistJob = await db.job.findUnique({ where: { id: historicalJob.id } });
    assert(checkHistJob?.customer === ownerA.name, "Owner A historical job customer name remains intact");
    assert(checkHistJob?.vehicle === testVehNoNorm, "Historical job vehicle reference remains intact");


    // ------------------------------------------------------------------------
    // SECTION 9: ODOMETER AUTHORITY
    // ------------------------------------------------------------------------
    console.log(`\n[9] Testing Odometer Authority (3 Visits)...`);
    const odoPhone = `95551${Math.floor(10000 + Math.random() * 90000)}`;
    const odoVehNo = `TN10OD${Math.floor(1000 + Math.random() * 9000)}`;

    // Visit 1: Odometer = 50,000 km
    console.log(`  Visit 1: Odometer = 50,000 km...`);
    const checkin1 = await checkinService.createCheckin({
      vehicle: odoVehNo,
      model: "Honda City",
      customer: `Odometer Test Customer ${testRunId}`,
      phone: odoPhone,
      service: "Service 1",
      inTime: new Date().toISOString(),
      status: "Pending",
      odometer: "50000",
      notes: "Visit 1"
    }, testFranchiseA.id);

    const carIn1 = await db.carIn.findUnique({ where: { id: checkin1.id } });
    const vehMaster1 = await db.customerVehicle.findFirst({ where: { vehicleNo: normalizeVehicleNo(odoVehNo) } });
    assert(carIn1?.odometer === "50000", "Visit 1 CarIn.odometer = 50000");
    assert(vehMaster1?.odometer === 50000, "Visit 1 CustomerVehicle.odometer updated to 50000");

    // Visit 2: Lower Odometer = 45,000 km (Lower reading)
    console.log(`  Visit 2: Odometer = 45,000 km (Regression Attempt)...`);
    // Delete recent checkin restriction for testing back-to-back visits
    await db.carIn.delete({ where: { id: checkin1.id } });
    
    const checkin2 = await checkinService.createCheckin({
      vehicle: odoVehNo,
      model: "Honda City",
      customer: `Odometer Test Customer ${testRunId}`,
      phone: odoPhone,
      service: "Service 2",
      inTime: new Date().toISOString(),
      status: "Pending",
      odometer: "45000",
      notes: "Visit 2 (Regression test)"
    }, testFranchiseA.id);

    const carIn2 = await db.carIn.findUnique({ where: { id: checkin2.id } });
    const vehMaster2 = await db.customerVehicle.findFirst({ where: { vehicleNo: normalizeVehicleNo(odoVehNo) } });
    assert(carIn2?.odometer === "45000", "Visit 2 CarIn.odometer preserves visit reading = 45000");
    assert(vehMaster2?.odometer === 50000, "Visit 2 CustomerVehicle.odometer DID NOT REGRESS (remains 50000)");

    // Visit 3: Higher Odometer = 55,000 km (Advancement)
    console.log(`  Visit 3: Odometer = 55,000 km (Advancement)...`);
    await db.carIn.delete({ where: { id: checkin2.id } });

    const checkin3 = await checkinService.createCheckin({
      vehicle: odoVehNo,
      model: "Honda City",
      customer: `Odometer Test Customer ${testRunId}`,
      phone: odoPhone,
      service: "Service 3",
      inTime: new Date().toISOString(),
      status: "Pending",
      odometer: "55000",
      notes: "Visit 3"
    }, testFranchiseA.id);

    const carIn3 = await db.carIn.findUnique({ where: { id: checkin3.id } });
    const vehMaster3 = await db.customerVehicle.findFirst({ where: { vehicleNo: normalizeVehicleNo(odoVehNo) } });
    assert(carIn3?.odometer === "55000", "Visit 3 CarIn.odometer = 55000");
    assert(vehMaster3?.odometer === 55000, "Visit 3 CustomerVehicle.odometer advanced to 55000");


    // ------------------------------------------------------------------------
    // SECTION 10 & 11: REFERRAL REWARD & SELF-REFERRAL
    // ------------------------------------------------------------------------
    console.log(`\n[10 & 11] Testing Referral Reward & Self-Referral Protection...`);
    const referrerCust = await customerService.createCustomer({
      name: `Referrer Customer ${testRunId}`,
      phone: `94441${Math.floor(10000 + Math.random() * 90000)}`
    }, testFranchiseA.id);

    const referredPhone = `94442${Math.floor(10000 + Math.random() * 90000)}`;

    // Self-Referral Test
    console.log(`  Testing Self-Referral Protection...`);
    let selfRefErrorThrown = false;
    try {
      await referralService.createReferral({
        referringCustomerId: referrerCust.id,
        referringCustomer: referrerCust.name,
        referredName: "Self Referral",
        referredPhone: referrerCust.phone
      }, testFranchiseA.id);
    } catch (err: any) {
      selfRefErrorThrown = true;
      assert(err.message.includes("Self-referral is not allowed"), "Self-referral rejected with error");
    }
    assert(selfRefErrorThrown, "Self-referral attempt threw validation exception");

    // Normal Referral Conversion & Reward
    console.log(`  Testing Normal Referral Conversion Reward (+100 Points)...`);
    const ref = await referralService.createReferral({
      referringCustomerId: referrerCust.id,
      referringCustomer: referrerCust.name,
      referredName: "Referred Friend",
      referredPhone
    }, testFranchiseA.id);

    // Create lead for referred phone and convert it
    const refLead = await leadService.createLead({
      name: "Referred Friend Lead",
      phone: referredPhone,
      service: "General Checkup",
      vehicle: "TN 11 RF 1111",
      status: "New",
      notes: "Referral lead"
    }, testFranchiseA.id);

    await leadService.convertLead(refLead.id);

    const updatedReferrer1 = await db.customer.findUnique({ where: { id: referrerCust.id } });
    assert(updatedReferrer1?.rewardPoints === 100, "Referring customer awarded +100 reward points");

    // Double conversion reward check (Idempotency)
    console.log(`  Testing Referral Reward Idempotency (Repeat Conversion)...`);
    await referralService.handleCustomerConversion(referredPhone, refLead.customerId!);
    const updatedReferrer2 = await db.customer.findUnique({ where: { id: referrerCust.id } });
    assert(updatedReferrer2?.rewardPoints === 100, "Repeat referral conversion DOES NOT award double reward points (remains 100)");


    // ------------------------------------------------------------------------
    // SECTION 12 & 13: CROSS-FRANCHISE AUTHORIZATION & SEARCH SECURITY
    // ------------------------------------------------------------------------
    console.log(`\n[12 & 13] Testing Cross-Franchise Authorization & Search Security...`);
    const franACust = await customerService.createCustomer({
      name: `Franchise A Customer ${testRunId}`,
      phone: `93331${Math.floor(10000 + Math.random() * 90000)}`
    }, testFranchiseA.id);

    const franBCust = await customerService.createCustomer({
      name: `Franchise B Customer ${testRunId}`,
      phone: `93332${Math.floor(10000 + Math.random() * 90000)}`
    }, testFranchiseB.id);

    // Test Search Scope using dataScope
    const scopeFranA = scopeWhere(resolveDataScope({ role: "FRANCHISE_USER", franchiseId: testFranchiseA.id }));
    const searchResultsFranA = await customerService.searchCustomers(testRunId, scopeFranA);
    
    const returnedCustIds = searchResultsFranA.map((c: any) => c.id);
    assert(returnedCustIds.includes(franACust.id), "Franchise A user search finds Franchise A customer");
    assert(!returnedCustIds.includes(franBCust.id), "Franchise A user search DOES NOT reveal Franchise B customer");


    // ------------------------------------------------------------------------
    // SECTION 14 & 15 & 16: RECEPTION, JOB REFERENCE CHAIN & END-TO-END
    // ------------------------------------------------------------------------
    console.log(`\n[14, 15 & 16] Testing End-to-End Lifecycle & Job Reference Chain...`);
    
    // Complete Identity Chain Flow:
    // Lead -> Convert -> Customer -> Vehicle -> Reception Check-in -> Job Reference
    const e2ePhone = `92221${Math.floor(10000 + Math.random() * 90000)}`;
    const e2eVehNo = `TN 12 E2E ${Math.floor(1000 + Math.random() * 9000)}`;
    const e2eVehNorm = normalizeVehicleNo(e2eVehNo);

    // 1. Create Lead
    const e2eLead = await leadService.createLead({
      name: `E2E Lifecycle Customer ${testRunId}`,
      phone: e2ePhone,
      email: `e2e_${testRunId}@example.com`,
      service: "Engine Overhaul",
      vehicle: e2eVehNo,
      vehicleMake: "Mahindra",
      vehicleModel: "Thar",
      status: "New",
      notes: "Full E2E test lead",
      budget: "50000"
    }, testFranchiseA.id);

    // 2. Convert Lead → Customer
    const e2eCust = await leadService.convertLead(e2eLead.id);
    assert(e2eCust.phone === e2ePhone, "Step 2: Customer created from Lead");

    // 3. Vehicle Check-in (Reception)
    const e2eCheckin = await checkinService.createCheckin({
      vehicle: e2eVehNo,
      model: "Mahindra Thar",
      customer: e2eCust.name,
      phone: e2ePhone,
      service: "Engine Overhaul",
      inTime: new Date().toISOString(),
      status: "Pending",
      odometer: "15000",
      notes: "E2E Reception Checkin"
    }, testFranchiseA.id);

    assert(e2eCheckin !== null, "Step 3: Reception Check-in created");

    // 4. Verify Job Card Reference Chain
    const e2eJob = await db.job.findFirst({ where: { carInId: e2eCheckin.id } });
    assert(e2eJob !== null, "Step 4: Job Card auto-created from check-in");
    assert(e2eJob?.carInId === e2eCheckin.id, "Job.carInId references CarIn.id");
    assert(e2eJob?.vehicle === e2eVehNorm, "Job.vehicle matches normalized vehicle number");

    const e2eVehMaster = await db.customerVehicle.findFirst({ where: { vehicleNo: e2eVehNorm } });
    assert(e2eVehMaster?.customerId === e2eCust.id, "CustomerVehicle linked to Customer master");

    // Verify Customer History Timeline
    const e2eHistory = await customerService.getCustomerHistory(e2eCust.id);
    assert(e2eHistory.timeline.length > 0, "Customer history timeline assembled successfully");
    const timelineTypes = e2eHistory.timeline.map((t: any) => t.type);
    assert(timelineTypes.includes("LEAD_CREATED"), "Timeline includes LEAD_CREATED event");
    assert(timelineTypes.includes("LEAD_CONVERTED"), "Timeline includes LEAD_CONVERTED event");
    assert(timelineTypes.includes("VEHICLE_CHECK_IN"), "Timeline includes VEHICLE_CHECK_IN event");
    assert(timelineTypes.includes("JOB"), "Timeline includes JOB event");


    // ------------------------------------------------------------------------
    // SECTION 17: TRANSACTION ROLLBACK TEST
    // ------------------------------------------------------------------------
    console.log(`\n[17] Testing Transaction Boundaries & Rollback Integrity...`);
    let txErrorThrown = false;
    try {
      await db.$transaction(async (tx) => {
        const dummyCust = await tx.customer.create({
          data: {
            id: `DUMMY_TX_${testRunId}`,
            name: "Rollback Test",
            phone: `91111${Math.floor(10000 + Math.random() * 90000)}`,
            email: "rollback@example.com",
            vehicle: "TN 99 RB 9999",
            model: "Test",
            visits: 0,
            totalSpend: 0,
            lastVisit: new Date(),
            franchiseId: testFranchiseA.id
          }
        });
        
        // Force error midway to trigger rollback
        throw new Error("Controlled Transaction Failure Test");
      });
    } catch (err: any) {
      txErrorThrown = true;
      assert(err.message === "Controlled Transaction Failure Test", "Transaction caught controlled failure");
    }

    assert(txErrorThrown, "Rollback test executed");
    const rolledBackCust = await db.customer.findUnique({ where: { id: `DUMMY_TX_${testRunId}` } });
    assert(rolledBackCust === null, "Transaction cleanly rolled back: no orphaned customer record remained in DB");

  } finally {
    // Cleanup Test Data
    console.log(`\nCleaning up test records for run ${testRunId}...`);
    try {
      await db.referral.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } });
      await db.leadFollowUp.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } });
      await db.leadAssignmentHistory.deleteMany({ where: { lead: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } } });
      await db.leadTransferHistory.deleteMany({ where: { lead: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } } });
      await db.job.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } });
      await db.carIn.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } });
      await db.lead.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } });
      await db.customerVehicle.deleteMany({ where: { customer: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } } });
      await db.customer.deleteMany({ where: { franchiseId: { in: [testFranchiseA.id, testFranchiseB.id] } } });
      await db.franchise.deleteMany({ where: { id: { in: [testFranchiseA.id, testFranchiseB.id] } } });
      console.log(`✓ Test cleanup completed.`);
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
    }
  }

  console.log(`\n=======================================================`);
  console.log(`TEST SUMMARY`);
  console.log(`  Passed: ${passedTests}`);
  console.log(`  Failed: ${failedTests}`);
  console.log(`=======================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal Test Execution Error:", err);
  process.exit(1);
});
