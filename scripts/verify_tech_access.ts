import { VehicleCheckinService } from "../src/modules/vehicle-checkin/service/vehicle-checkin.service.js";
import { JobCardService } from "../src/modules/job-card/service/job-card.service.js";
import { db } from "../src/lib/db.js";

async function runVerification() {
  console.log("=== Starting Technician Access Verification ===");

  const checkinService = new VehicleCheckinService();
  const jobService = new JobCardService();

  const testVehicleNo = "TEST-ACCESS-" + Date.now().toString().slice(-4);
  console.log(`1. Checking in new vehicle: ${testVehicleNo}`);

  // 1. Create a Check-in
  const checkin = await checkinService.createCheckin(
    {
      vehicle: testVehicleNo,
      model: "Test Model",
      customer: "Test Customer",
      phone: "9998887776",
      service: "General Service",
      inTime: new Date().toISOString(),
      odometer: "1000",
      notes: "Testing access control",
    },
    null
  );

  console.log(`CarIn Created: ID = ${checkin.id}, JobCardID = ${checkin.jobCardId}`);

  // Define Mock Users
  const serviceAdvisorUser = { id: "EMP-SA-1", name: "Service Advisor", role: "SERVICE_ADVISOR" };
  const techA = { id: "TECH-001", name: "Technician Alpha", role: "TECHNICIAN" };
  const techB = { id: "TECH-002", name: "Technician Beta", role: "TECHNICIAN" };

  // 2. Test initial state (unassigned vehicle/job)
  console.log("\n2. Testing UNASSIGNED state:");
  
  const allCheckinsSA = await checkinService.getAllCheckins(serviceAdvisorUser);
  const foundSA = allCheckinsSA.some((c) => c.id === checkin.id);
  console.log(`- Service Advisor can see checkin? ${foundSA} (Expected: true)`);

  const allCheckinsTechA = await checkinService.getAllCheckins(techA);
  const foundTechA_unassigned = allCheckinsTechA.some((c) => c.id === checkin.id);
  console.log(`- Tech A can see checkin? ${foundTechA_unassigned} (Expected: false)`);

  const allCheckinsTechB = await checkinService.getAllCheckins(techB);
  const foundTechB_unassigned = allCheckinsTechB.some((c) => c.id === checkin.id);
  console.log(`- Tech B can see checkin? ${foundTechB_unassigned} (Expected: false)`);

  const jobsTechA_unassigned = await jobService.getJobs({
    OR: [{ technicianId: techA.id }, { technician: { equals: techA.name, mode: "insensitive" } }],
  });
  const jobFoundTechA_unassigned = jobsTechA_unassigned.some((j) => j.id === checkin.jobCardId);
  console.log(`- Tech A can see job? ${jobFoundTechA_unassigned} (Expected: false)`);

  // 3. Assign Job to Tech A
  console.log(`\n3. Assigning Job ${checkin.jobCardId} to Tech A (${techA.name} / ${techA.id}):`);
  await jobService.updateJob(checkin.jobCardId, {
    technician: techA.name,
    technicianId: techA.id,
  });

  // 4. Test ASSIGNED state
  console.log("\n4. Testing ASSIGNED state:");
  const checkinsTechA_assigned = await checkinService.getAllCheckins(techA);
  const foundTechA_assigned = checkinsTechA_assigned.some((c) => c.id === checkin.id);
  console.log(`- Tech A (assigned) can see checkin? ${foundTechA_assigned} (Expected: true)`);

  const checkinsTechB_assigned = await checkinService.getAllCheckins(techB);
  const foundTechB_assigned = checkinsTechB_assigned.some((c) => c.id === checkin.id);
  console.log(`- Tech B (unassigned) can see checkin? ${foundTechB_assigned} (Expected: false)`);

  let techB_accessError = false;
  try {
    await checkinService.checkTechnicianAccess(checkin.id, techB);
  } catch (err: any) {
    techB_accessError = true;
    console.log(`- Tech B mutation check blocked as expected with error: "${err.message}" (Status: ${err.statusCode || 403})`);
  }

  let techA_accessError = false;
  try {
    await checkinService.checkTechnicianAccess(checkin.id, techA);
    console.log("- Tech A mutation check allowed as expected.");
  } catch (err: any) {
    techA_accessError = true;
  }

  // Clean up test data
  console.log("\n5. Cleaning up test data...");
  await checkinService.deleteCheckin(checkin.id);
  console.log("Cleanup complete.");

  if (
    foundSA &&
    !foundTechA_unassigned &&
    !foundTechB_unassigned &&
    !jobFoundTechA_unassigned &&
    foundTechA_assigned &&
    !foundTechB_assigned &&
    techB_accessError &&
    !techA_accessError
  ) {
    console.log("\n>>> ALL VERIFICATION TESTS PASSED SUCCESSFULLY! <<<");
  } else {
    console.error("\n>>> VERIFICATION TEST FAILED! <<<");
    process.exit(1);
  }
}

runVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Verification script failed with error:", err);
    process.exit(1);
  });
