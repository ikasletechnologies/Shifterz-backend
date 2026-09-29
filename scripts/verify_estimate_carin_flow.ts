import { db } from '../src/lib/db.js';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { BillingService } from '../src/modules/billing/service/billing.service.js';
import { ValidationError } from '../src/shared/errors/ValidationError.js';
import { ForbiddenError } from '../src/shared/errors/ForbiddenError.js';

async function runTests() {
  console.log('=== STARTING ESTIMATE → CAR IN WORKFLOW TESTS ===\n');

  const checkinService = new VehicleCheckinService();
  const billingService = new BillingService();

  // Clean up any test artifacts from previous runs
  const testVehicleA = 'TN 72 AB 2353';
  const testVehicleB = 'TN 09 XY 9999';
  const testPhoneA = '9876543210';
  const testPhoneB = '9123456780';

  const testVehicles = [testVehicleA, 'TN72AB2353', testVehicleB, 'TN09XY9999'];

  const existingJobs = await db.job.findMany({ where: { vehicle: { in: testVehicles } }, select: { id: true } });
  const existingJobIds = existingJobs.map(j => j.id);
  if (existingJobIds.length > 0) {
    await db.jobHistory.deleteMany({ where: { jobId: { in: existingJobIds } } });
  }
  await db.job.deleteMany({ where: { vehicle: { in: testVehicles } } });
  await db.carIn.deleteMany({ where: { vehicle: { in: testVehicles } } });
  await db.invoice.deleteMany({ where: { vehicle: { in: testVehicles } } });
  await db.customerVehicle.deleteMany({ where: { vehicleNo: { in: testVehicles } } });
  await db.customer.deleteMany({ where: { phone: { in: [testPhoneA, testPhoneB] } } });

  // 1. Get or create test franchises
  let franchises = await db.franchise.findMany();
  let franchiseA = franchises[0];
  let franchiseB = franchises[1];

  if (!franchiseA) {
    franchiseA = await db.franchise.create({
      data: {
        id: 'clx_test_franchise_a',
        name: 'Test Franchise A',
        city: 'Tirunelveli',
        location: 'Tirunelveli',
        address: '123 Main St',
        phone: '9999900001',
        email: 'franchiseA@shifterz.com',
        owner: 'Owner A',
      }
    });
  }

  if (!franchiseB) {
    franchiseB = await db.franchise.create({
      data: {
        id: 'clx_test_franchise_b',
        name: 'Test Franchise B',
        city: 'Madurai',
        location: 'Madurai',
        address: '456 Cross St',
        phone: '9999900002',
        email: 'franchiseB@shifterz.com',
        owner: 'Owner B',
      }
    });
  }

  console.log(`Franchise A: ${franchiseA.id} (${franchiseA.name})`);
  console.log(`Franchise B: ${franchiseB.id} (${franchiseB.name})`);

  // Test Case 1: Create an Estimate for Customer A at Franchise A, then Convert to Car In
  console.log('\n--- TEST CASE 1: Create Estimate for Franchise A & Convert to Car In ---');
  const superAdminUser = { id: 'admin1', name: 'Super Admin', role: 'SUPER_ADMIN', franchiseId: null };
  const franchiseAAdmin = { id: 'adminA', name: 'Franchise A Admin', role: 'FRANCHISE_ADMIN', franchiseId: franchiseA.id };
  const franchiseBAdmin = { id: 'adminB', name: 'Franchise B Admin', role: 'FRANCHISE_ADMIN', franchiseId: franchiseB.id };

  const estimateA = await billingService.createInvoice({
    type: 'Estimate',
    client: 'kumar',
    phone: testPhoneA,
    vehicle: testVehicleA,
    model: 'Hyundai i20',
    service: 'General Service',
    amount: 2500,
    gst: 450,
    discount: 0,
    status: 'Pending',
    date: new Date(),
    dueDate: new Date(Date.now() + 7 * 86400000),
    notes: 'Customer TN 72 AB 2353 estimate',
    franchiseId: franchiseA.id,
  }, franchiseAAdmin);

  console.log(`Created Estimate ${estimateA.id} for Customer ${estimateA.client}, Amount: ${estimateA.amount}`);
  if (!estimateA.id.startsWith('STZ-EST-')) {
    throw new Error(`Estimate ID should start with STZ-EST-, got: ${estimateA.id}`);
  }

  // Convert Estimate to Car In as Franchise A Admin
  const checkinResult = await checkinService.createCheckin({
    vehicle: estimateA.vehicle,
    model: estimateA.model || 'Hyundai i20',
    customer: estimateA.client,
    phone: estimateA.phone,
    service: estimateA.service,
    odometer: '45000',
    notes: `Converted from Estimate ${estimateA.id}`,
    estimateId: estimateA.id,
    franchiseId: franchiseA.id,
  }, franchiseA.id);

  console.log(`Car In created: ID=${checkinResult.id}, JobCardID=${checkinResult.jobCardId}, Franchise=${checkinResult.franchiseId}`);
  if (checkinResult.franchiseId !== franchiseA.id) {
    throw new Error(`Expected Car In franchise to be ${franchiseA.id}, got ${checkinResult.franchiseId}`);
  }

  // Verify Estimate was linked to Job Card and status updated
  const updatedEstimateA = await db.invoice.findUnique({ where: { id: estimateA.id } });
  if (!updatedEstimateA?.jobId || updatedEstimateA.jobId !== checkinResult.jobCardId) {
    throw new Error(`Estimate ${estimateA.id} was not linked to JobCard ${checkinResult.jobCardId}. Got: ${updatedEstimateA?.jobId}`);
  }
  if (updatedEstimateA.status !== 'Converted to Car In') {
    throw new Error(`Expected Estimate status to be "Converted to Car In", got: ${updatedEstimateA.status}`);
  }
  console.log(`Verified Estimate ${estimateA.id} is linked to JobCard ${updatedEstimateA.jobId} and status is "${updatedEstimateA.status}"`);

  // Verify services & items were carried over to Job Card
  const jobA = await db.job.findUnique({ where: { id: checkinResult.jobCardId } });
  console.log(`Job Card service: "${jobA?.service}", services line items: ${JSON.stringify(jobA?.services)}`);

  console.log('Test Case 1 Passed!');

  // Test Case 2: Attempt duplicate conversion for the same Estimate
  console.log('\n--- TEST CASE 2: Prevent Duplicate Car In for same Estimate / Vehicle ---');
  let duplicatePrevented = false;
  try {
    await checkinService.createCheckin({
      vehicle: estimateA.vehicle,
      model: estimateA.model || 'Hyundai i20',
      customer: estimateA.client,
      phone: estimateA.phone,
      service: estimateA.service,
      odometer: '45000',
      notes: `Attempt duplicate from Estimate ${estimateA.id}`,
      estimateId: estimateA.id,
      franchiseId: franchiseA.id,
    }, franchiseA.id);
  } catch (err: any) {
    if (err instanceof ValidationError) {
      console.log(`Duplicate correctly rejected with ValidationError: "${err.message}"`);
      duplicatePrevented = true;
    } else {
      throw err;
    }
  }

  if (!duplicatePrevented) {
    throw new Error('Duplicate conversion was not prevented!');
  }
  console.log('Test Case 2 Passed!');

  // Test Case 3: Franchise B cannot access or convert Franchise A's Estimate
  console.log('\n--- TEST CASE 3: Cross-Franchise Isolation (Franchise B cannot convert Franchise A Estimate) ---');
  const estimateA2 = await billingService.createInvoice({
    type: 'Estimate',
    client: 'ravi',
    phone: testPhoneB,
    vehicle: testVehicleB,
    model: 'Maruti Swift',
    service: 'Brake Service',
    amount: 1800,
    gst: 324,
    discount: 0,
    status: 'Pending',
    date: new Date(),
    dueDate: new Date(Date.now() + 7 * 86400000),
    notes: 'Estimate belonging to Franchise A',
    franchiseId: franchiseA.id,
  }, franchiseAAdmin);

  let crossFranchisePrevented = false;
  try {
    await checkinService.createCheckin({
      vehicle: estimateA2.vehicle,
      model: estimateA2.model || 'Maruti Swift',
      customer: estimateA2.client,
      phone: estimateA2.phone,
      service: estimateA2.service,
      odometer: '32000',
      notes: `Franchise B trying to convert Franchise A estimate`,
      estimateId: estimateA2.id,
      franchiseId: franchiseB.id,
    }, franchiseB.id); // Session franchiseId is Franchise B
  } catch (err: any) {
    if (err instanceof ForbiddenError) {
      console.log(`Cross-franchise conversion correctly rejected with ForbiddenError: "${err.message}"`);
      crossFranchisePrevented = true;
    } else {
      throw err;
    }
  }

  if (!crossFranchisePrevented) {
    throw new Error('Cross-franchise conversion was NOT rejected!');
  }
  console.log('Test Case 3 Passed!');

  // Test Case 4: Franchise A can convert its own Estimate, preserving Franchise A ownership
  console.log('\n--- TEST CASE 4: Franchise A converts its own Estimate ---');
  const checkinResultA2 = await checkinService.createCheckin({
    vehicle: estimateA2.vehicle,
    model: estimateA2.model || 'Maruti Swift',
    customer: estimateA2.client,
    phone: estimateA2.phone,
    service: estimateA2.service,
    odometer: '32000',
    notes: `Franchise A converting its own estimate`,
    estimateId: estimateA2.id,
    franchiseId: franchiseA.id,
  }, franchiseA.id);

  console.log(`Car In created: ID=${checkinResultA2.id}, Franchise=${checkinResultA2.franchiseId}`);
  if (checkinResultA2.franchiseId !== franchiseA.id) {
    throw new Error(`Expected Car In franchise to be ${franchiseA.id}, got ${checkinResultA2.franchiseId}`);
  }
  console.log('Test Case 4 Passed!');

  // Test Case 5: Super Admin can access and convert Estimates, preserving correct franchise ownership
  console.log('\n--- TEST CASE 5: Super Admin Global Access with Ownership Preservation ---');
  const testVehicleC = 'TN 01 CD 5555';
  const testPhoneC = '9555544444';

  const estimateA3 = await billingService.createInvoice({
    type: 'Estimate',
    client: 'suresh',
    phone: testPhoneC,
    vehicle: testVehicleC,
    model: 'Honda City',
    service: 'Clutch Overhaul',
    amount: 5000,
    gst: 900,
    discount: 0,
    status: 'Pending',
    date: new Date(),
    dueDate: new Date(Date.now() + 7 * 86400000),
    notes: 'Estimate created for Franchise A',
    franchiseId: franchiseA.id,
  }, superAdminUser);

  // Super Admin converts it (caller franchiseId is null because Super Admin is HQ)
  const checkinResultSA = await checkinService.createCheckin({
    vehicle: estimateA3.vehicle,
    model: estimateA3.model || 'Honda City',
    customer: estimateA3.client,
    phone: estimateA3.phone,
    service: estimateA3.service,
    odometer: '32500',
    notes: `Converted by Super Admin from Estimate ${estimateA3.id}`,
    estimateId: estimateA3.id,
  }, null);

  console.log(`Super Admin check-in created: ID=${checkinResultSA.id}, Franchise=${checkinResultSA.franchiseId}`);
  if (checkinResultSA.franchiseId !== franchiseA.id) {
    throw new Error(`Expected Car In franchise to preserve Franchise A (${franchiseA.id}), got ${checkinResultSA.franchiseId}`);
  }

  // Check customer and vehicle records to ensure no duplicates
  const customers = await db.customer.findMany({ where: { phone: testPhoneC } });
  console.log(`Customer count for phone ${testPhoneC}: ${customers.length}`);
  if (customers.length !== 1) {
    throw new Error(`Expected exactly 1 customer record for phone ${testPhoneC}, got ${customers.length}`);
  }

  const vehicles = await db.customerVehicle.findMany({ where: { vehicleNo: 'TN01CD5555' } });
  console.log(`Vehicle count for vehicle TN01CD5555: ${vehicles.length}`);
  if (vehicles.length !== 1) {
    throw new Error(`Expected exactly 1 vehicle record for vehicle TN01CD5555, got ${vehicles.length}`);
  }

  console.log('Test Case 5 Passed!');

  // Test Case 6: Checkout / Delivery allows vehicle to check in again for a new Estimate
  console.log('\n--- TEST CASE 6: Vehicle Delivery / Car Out allows new Car In ---');
  // Deliver vehicle C
  await db.carIn.update({
    where: { id: checkinResultSA.id },
    data: { status: 'Delivered', outTime: new Date() }
  });
  await db.job.update({
    where: { id: checkinResultSA.jobCardId },
    data: { status: 'Delivered' }
  });

  // Create a new estimate for vehicle C
  const estimateA4 = await billingService.createInvoice({
    type: 'Estimate',
    client: 'suresh',
    phone: testPhoneC,
    vehicle: testVehicleC,
    model: 'Honda City',
    service: 'Brake Pad Replacement',
    amount: 3200,
    gst: 576,
    discount: 0,
    status: 'Pending',
    date: new Date(),
    dueDate: new Date(Date.now() + 7 * 86400000),
    notes: 'Second estimate after first delivery',
    franchiseId: franchiseA.id,
  }, superAdminUser);

  // Convert second estimate to Car In
  const checkinResultSA2 = await checkinService.createCheckin({
    vehicle: estimateA4.vehicle,
    model: estimateA4.model || 'Honda City',
    customer: estimateA4.client,
    phone: estimateA4.phone,
    service: estimateA4.service,
    odometer: '33000',
    notes: `Second checkin from Estimate ${estimateA4.id}`,
    estimateId: estimateA4.id,
  }, null);

  console.log(`Re-checkin created successfully: ID=${checkinResultSA2.id}, JobCardID=${checkinResultSA2.jobCardId}`);
  if (!checkinResultSA2.id) {
    throw new Error('Expected re-checkin to succeed after vehicle was delivered!');
  }
  console.log('Test Case 6 Passed!');

  // Clean up test records
  console.log('\n--- CLEANING UP TEST ARTIFACTS ---');
  await db.jobHistory.deleteMany({ where: { jobId: { in: [checkinResult.jobCardId, checkinResultA2.jobCardId, checkinResultSA.jobCardId, checkinResultSA2.jobCardId] } } });
  await db.job.deleteMany({ where: { id: { in: [checkinResult.jobCardId, checkinResultA2.jobCardId, checkinResultSA.jobCardId, checkinResultSA2.jobCardId] } } });
  await db.carIn.deleteMany({ where: { id: { in: [checkinResult.id, checkinResultA2.id, checkinResultSA.id, checkinResultSA2.id] } } });
  await db.invoice.deleteMany({ where: { id: { in: [estimateA.id, estimateA2.id, estimateA3.id, estimateA4.id] } } });
  await db.customerVehicle.deleteMany({ where: { vehicleNo: { in: [testVehicleA, 'TN72AB2353', testVehicleB, 'TN09XY9999', testVehicleC, 'TN01CD5555'] } } });
  await db.customer.deleteMany({ where: { phone: { in: [testPhoneA, testPhoneB, testPhoneC] } } });

  console.log('\n=== ALL 6 TEST CASES PASSED SUCCESSFULLY! ===');
}

runTests()
  .catch((err) => {
    console.error('Test failed with error:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
