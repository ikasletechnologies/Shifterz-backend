import { db } from '../src/lib/db.js';
import { BillingService } from '../src/modules/billing/service/billing.service.js';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { OutpassService } from '../src/modules/outpass/service/outpass.service.js';
import { resolveDataScope } from '../src/shared/scope/dataScope.js';
import { ValidationError } from '../src/shared/errors/ValidationError.js';
import { ForbiddenError } from '../src/shared/errors/ForbiddenError.js';

const testRunId = `EST2CAR_${Date.now()}`;
console.log(`=======================================================`);
console.log(`STARTING ESTIMATE TO CAR IN INTEGRATION TESTS`);
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
  const billingService = new BillingService();
  const checkinService = new VehicleCheckinService();

  // Initial cleanup of stale test records if any
  await db.outPass.deleteMany({
    where: { vehicle: { in: ['TN 72 AB 2353', 'TN72AB2353', 'KL 01 CD 5678', 'KL01CD5678'] } }
  });
  const staleJobs = await db.job.findMany({
    where: { vehicle: { in: ['TN 72 AB 2353', 'TN72AB2353', 'KL 01 CD 5678', 'KL01CD5678'] } },
    select: { id: true },
  });
  const staleJobIds = staleJobs.map(j => j.id);
  if (staleJobIds.length > 0) {
    await db.jobHistory.deleteMany({ where: { jobId: { in: staleJobIds } } });
    await db.job.deleteMany({ where: { id: { in: staleJobIds } } });
  }
  await db.carIn.deleteMany({
    where: { vehicle: { in: ['TN 72 AB 2353', 'TN72AB2353', 'KL 01 CD 5678', 'KL01CD5678'] } }
  });
  await db.invoice.deleteMany({
    where: { vehicle: { in: ['TN 72 AB 2353', 'TN72AB2353', 'KL 01 CD 5678', 'KL01CD5678'] } }
  });
  await db.customerVehicle.deleteMany({
    where: { vehicleNo: { in: ['TN 72 AB 2353', 'TN72AB2353', 'KL 01 CD 5678', 'KL01CD5678'] } }
  });
  await db.customer.deleteMany({
    where: { phone: { in: ['9876543220', '9876543299'] } }
  });

  // 1. Create two test franchises
  const franchiseA = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_A`,
      name: "Estimate Test Branch A",
      city: "Tirunelveli",
      owner: "Admin A",
      phone: "9876543210",
      since: new Date(),
      revenue: 0,
      jobs: 0,
      royaltyPct: 0,
      status: "Active",
    },
  });

  const franchiseB = await db.franchise.create({
    data: {
      id: `${testRunId}_FRAN_B`,
      name: "Estimate Test Branch B",
      city: "Madurai",
      owner: "Admin B",
      phone: "9876543211",
      since: new Date(),
      revenue: 0,
      jobs: 0,
      royaltyPct: 0,
      status: "Active",
    },
  });

  const superAdminActor = { id: "sa-1", role: "SUPER_ADMIN", franchiseId: null };
  const franchiseAdminActorA = { id: "fa-A", role: "FRANCHISE_ADMIN", franchiseId: franchiseA.id };
  const franchiseAdminActorB = { id: "fa-B", role: "FRANCHISE_ADMIN", franchiseId: franchiseB.id };

  const testVehicle = "TN 72 AB 2353";
  const testCustomer = "kumar";
  const testPhone = "9876543220";

  console.log("TEST SUITE 1: Create Estimate in Billing for customer kumar & vehicle TN 72 AB 2353");
  const estimate1 = await billingService.createInvoice({
    type: "Estimate",
    client: testCustomer,
    phone: testPhone,
    vehicle: testVehicle,
    service: "Car Cleaning, Oil Change",
    amount: 3500,
    gst: 630,
    discount: 100,
    status: "Pending",
    date: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    notes: "Customer requested quick service and synthetic oil",
    franchiseId: franchiseA.id,
    items: [
      { desc: "Car Cleaning", qty: 1, price: 1000, amount: 1000 },
      { desc: "Oil Change", qty: 1, price: 500, amount: 500 },
      { desc: "Engine Oil", qty: 1, price: 1500, amount: 1500 },
      { desc: "Oil Filter", qty: 1, price: 500, amount: 500 },
    ],
  }, franchiseAdminActorA);

  assert(Boolean(estimate1.id), `Estimate created with ID: ${estimate1.id}`);
  assert(estimate1.type === "Estimate", "Document type is Estimate");
  assert(estimate1.status === "Pending", "Document status is Pending");
  assert(estimate1.franchiseId === franchiseA.id, "Estimate belongs to Franchise A");

  console.log("\nTEST SUITE 2: Franchise Isolation & Security on Conversion");
  // Franchise Admin B attempts to convert Franchise A's estimate -> must be blocked
  let crossFranchiseBlocked = false;
  try {
    await checkinService.createCheckin({
      vehicle: testVehicle,
      model: "Hyundai i20",
      customer: testCustomer,
      phone: testPhone,
      service: "Car Cleaning, Oil Change",
      odometer: "15000",
      notes: "Converted from Estimate",
      estimateId: estimate1.id,
    }, franchiseB.id);
  } catch (err: any) {
    if (err instanceof ForbiddenError) {
      crossFranchiseBlocked = true;
    }
  }
  assert(crossFranchiseBlocked, "Franchise Admin B is blocked from converting Franchise A's estimate (ForbiddenError)");

  console.log("\nTEST SUITE 3: Valid Conversion by authorized Franchise Admin A");
  const checkinResult = await checkinService.createCheckin({
    vehicle: testVehicle,
    model: "Hyundai i20",
    customer: testCustomer,
    phone: testPhone,
    service: "Car Cleaning, Oil Change",
    odometer: "15000",
    notes: "Customer requested quick service and synthetic oil (Converted from Estimate)",
    estimateId: estimate1.id,
  }, franchiseA.id);

  assert(Boolean(checkinResult.id), `Car In created with ID: ${checkinResult.id}`);
  assert(checkinResult.vehicle === "TN72AB2353" || checkinResult.vehicle === testVehicle, "Car In vehicle number matches");
  assert(checkinResult.customer === testCustomer, "Car In customer matches");
  assert(checkinResult.phone === testPhone, "Car In phone matches");
  assert(checkinResult.franchiseId === franchiseA.id, "Car In belongs to Franchise A");
  assert(Boolean(checkinResult.jobCardId), `Job Card auto-created with ID: ${checkinResult.jobCardId}`);

  console.log("\nTEST SUITE 4: Verify Carried Over Services & Items in Job Card");
  const createdJob = await db.job.findUnique({
    where: { id: checkinResult.jobCardId },
  });
  assert(Boolean(createdJob), "Job record found in database");
  assert(createdJob!.customer === testCustomer, "Job customer matches");
  assert(createdJob!.status === "Pending", "Job initial status is Pending");
  assert(createdJob!.franchiseId === franchiseA.id, "Job franchiseId matches");

  const jobServices = createdJob!.services as any[];
  assert(Array.isArray(jobServices) && jobServices.length === 4, `Job received 4 carried over line items (got ${jobServices?.length})`);
  assert(jobServices[0].name === "Car Cleaning", "Service 'Car Cleaning' carried over");
  assert(jobServices[1].name === "Oil Change", "Service 'Oil Change' carried over");
  assert(jobServices[2].name === "Engine Oil", "Item 'Engine Oil' carried over");
  assert(jobServices[3].name === "Oil Filter", "Item 'Oil Filter' carried over");

  console.log("\nTEST SUITE 5: Verify Estimate status updated to 'Converted to Car In' and jobId linked");
  const updatedEstimate = await db.invoice.findUnique({
    where: { id: estimate1.id },
  });
  assert(updatedEstimate!.status === "Converted to Car In", `Estimate status is "${updatedEstimate!.status}"`);
  assert(updatedEstimate!.jobId === checkinResult.jobCardId, `Estimate jobId is linked to Job Card ${checkinResult.jobCardId}`);

  console.log("\nTEST SUITE 6: Verify Customer and Vehicle Master Re-used without duplicates");
  const customerRecords = await db.customer.findMany({
    where: { phone: testPhone, isDeleted: false },
  });
  assert(customerRecords.length === 1, `Exactly 1 Customer record exists for phone ${testPhone} (no duplicates)`);
  assert(customerRecords[0].visits >= 1, "Customer visits count tracked");

  const vehicleRecords = await db.customerVehicle.findMany({
    where: { vehicleNo: "TN72AB2353", isDeleted: false },
  });
  assert(vehicleRecords.length === 1, "Exactly 1 CustomerVehicle record exists (no duplicates)");
  assert(vehicleRecords[0].customerId === customerRecords[0].id, "CustomerVehicle is properly associated with Customer");

  console.log("\nTEST SUITE 7: Duplicate Prevention - Converting the same Estimate again");
  let duplicateEstimateBlocked = false;
  try {
    await checkinService.createCheckin({
      vehicle: testVehicle,
      model: "Hyundai i20",
      customer: testCustomer,
      phone: testPhone,
      service: "Car Cleaning",
      odometer: "15000",
      estimateId: estimate1.id,
    }, franchiseA.id);
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes("already created for this Estimate")) {
      duplicateEstimateBlocked = true;
    }
  }
  assert(duplicateEstimateBlocked, "Converting the same Estimate again is blocked with 'Car In already created for this Estimate.'");

  console.log("\nTEST SUITE 8: Duplicate Prevention - Vehicle currently checked in workshop");
  // Create a second estimate for the same vehicle while vehicle is still in workshop
  const estimate2 = await billingService.createInvoice({
    type: "Estimate",
    client: testCustomer,
    phone: testPhone,
    vehicle: testVehicle,
    service: "Wheel Alignment",
    amount: 800,
    gst: 144,
    discount: 0,
    status: "Pending",
    notes: "Second estimate",
    franchiseId: franchiseA.id,
    items: [{ desc: "Wheel Alignment", qty: 1, price: 800, amount: 800 }],
  }, franchiseAdminActorA);

  let activeCheckinBlocked = false;
  let activeCheckinMessage = "";
  try {
    await checkinService.createCheckin({
      vehicle: testVehicle,
      model: "Hyundai i20",
      customer: testCustomer,
      phone: testPhone,
      service: "Wheel Alignment",
      odometer: "15000",
      estimateId: estimate2.id,
    }, franchiseA.id);
  } catch (err: any) {
    if (err instanceof ValidationError) {
      activeCheckinBlocked = true;
      activeCheckinMessage = err.message;
    }
  }
  assert(activeCheckinBlocked, "New check-in for vehicle currently inside workshop is blocked");
  assert(activeCheckinMessage.includes("is already checked in"), `Error message is informative: "${activeCheckinMessage}"`);

  console.log("\nTEST SUITE 9: Complete Car Out / Delivery & Re-Checkin Allowed");
  // Pass QC and clear billing gate to satisfy checkout delivery gate
  await db.job.update({
    where: { id: checkinResult.jobCardId },
    data: { status: "QC Passed", passedAt: new Date() },
  });
  await db.invoice.update({
    where: { id: estimate1.id },
    data: { status: "Paid" },
  });

  const outpassService = new OutpassService();
  const outpass = await outpassService.createOutpass({
    vehicle: testVehicle,
    customer: testCustomer,
    phone: testPhone,
    service: "Car Cleaning, Oil Change",
    invoiceId: estimate1.id,
    jobCardId: checkinResult.jobCardId,
    customerConfirmation: true,
    outTime: new Date().toISOString(),
    franchiseId: franchiseA.id,
  }, franchiseA.id, "fa-A", "Admin A");

  assert(Boolean(outpass.id), `Outpass created with ID: ${outpass.id}`);

  // Approve outpass (marks car delivered / out)
  await outpassService.approveOutpass(outpass.id, "fa-A", "Admin A", franchiseAdminActorA);

  const checkedOutCar = await db.carIn.findUnique({
    where: { id: checkinResult.id },
  });
  assert(checkedOutCar!.status === "Out" || checkedOutCar!.status === "Delivered", `CarIn status after checkout is "${checkedOutCar!.status}"`);
  assert(Boolean(checkedOutCar!.outTime), "CarIn outTime is recorded");

  const completedJob = await db.job.findUnique({
    where: { id: checkinResult.jobCardId },
  });
  assert(completedJob!.status === "Delivered", `Job status after checkout is "${completedJob!.status}"`);

  console.log("\nTEST SUITE 10: Verify vehicle CAN check in again after delivery");
  const secondCheckinResult = await checkinService.createCheckin({
    vehicle: testVehicle,
    model: "Hyundai i20",
    customer: testCustomer,
    phone: testPhone,
    service: "Wheel Alignment",
    odometer: "15200",
    estimateId: estimate2.id,
  }, franchiseA.id);

  assert(Boolean(secondCheckinResult.id), `Second Car In created successfully with ID: ${secondCheckinResult.id}`);
  assert(secondCheckinResult.id !== checkinResult.id, "New distinct Car In ID created");
  assert(secondCheckinResult.jobCardId !== checkinResult.jobCardId, "New distinct Job Card ID created");

  const updatedEstimate2 = await db.invoice.findUnique({
    where: { id: estimate2.id },
  });
  assert(updatedEstimate2!.status === "Converted to Car In", "Second Estimate is marked as Converted to Car In");

  console.log("\nTEST SUITE 11: Super Admin Conversion Across Franchises");
  const estimate3 = await billingService.createInvoice({
    type: "Estimate",
    client: "Super Customer",
    phone: "9876543299",
    vehicle: "KL 01 CD 5678",
    service: "Full Detailing",
    amount: 5000,
    gst: 900,
    discount: 0,
    status: "Pending",
    franchiseId: franchiseB.id,
    items: [{ desc: "Full Detailing", qty: 1, price: 5000, amount: 5000 }],
  }, superAdminActor);

  const saCheckinResult = await checkinService.createCheckin({
    vehicle: "KL 01 CD 5678",
    model: "Honda City",
    customer: "Super Customer",
    phone: "9876543299",
    service: "Full Detailing",
    odometer: "25000",
    estimateId: estimate3.id,
  }, null); // Super admin franchiseId is null

  assert(Boolean(saCheckinResult.id), "Super Admin converted Estimate to Car In");
  assert(saCheckinResult.franchiseId === franchiseB.id, "Car In correctly assigned to the Estimate's franchise B");

  // Cleanup test records
  console.log("\nCleaning up test records...");
  await db.jobHistory.deleteMany({
    where: { jobId: { in: [checkinResult.jobCardId, secondCheckinResult.jobCardId, saCheckinResult.jobCardId] } },
  });
  await db.job.deleteMany({
    where: { id: { in: [checkinResult.jobCardId, secondCheckinResult.jobCardId, saCheckinResult.jobCardId] } },
  });
  await db.carIn.deleteMany({
    where: { id: { in: [checkinResult.id, secondCheckinResult.id, saCheckinResult.id] } },
  });
  await db.invoice.deleteMany({
    where: { id: { in: [estimate1.id, estimate2.id, estimate3.id] } },
  });
  await db.customerVehicle.deleteMany({
    where: { vehicleNo: { in: ["TN72AB2353", "KL01CD5678"] } },
  });
  await db.customer.deleteMany({
    where: { phone: { in: [testPhone, "9876543299"] } },
  });
  await db.franchise.deleteMany({
    where: { id: { in: [franchiseA.id, franchiseB.id] } },
  });

  console.log(`\n=======================================================`);
  console.log(`ALL TESTS PASSED: ${passedTests} passed, ${failedTests} failed`);
  console.log(`=======================================================`);
}

runTests()
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
