import { VehicleCheckinService } from "../src/modules/vehicle-checkin/service/vehicle-checkin.service.js";
import { JobCardService } from "../src/modules/job-card/service/job-card.service.js";
import { db } from "../src/lib/db.js";

async function runTest() {
  console.log("=== Testing Delete Vehicle Check-In & Job Card ===");

  const checkinService = new VehicleCheckinService();
  const jobService = new JobCardService();

  const testVehicleNo = "TEST-DEL-" + Date.now().toString().slice(-4);
  console.log(`1. Creating checkin for ${testVehicleNo}`);

  const checkin = await checkinService.createCheckin(
    {
      vehicle: testVehicleNo,
      model: "Test Model",
      customer: "Test Customer",
      phone: "9998887776",
      service: "General Service",
      inTime: new Date().toISOString(),
      odometer: "1000",
      notes: "Test delete persistence",
    },
    null
  );

  console.log(`Checkin created with ID=${checkin.id}, JobCardID=${checkin.jobCardId}`);

  // Verify Job Card exists
  let jobs = await jobService.getJobs({});
  let jobFound = jobs.some((j) => j.id === checkin.jobCardId);
  console.log(`Job Card exists before deletion? ${jobFound} (Expected: true)`);

  // Delete from Car In page
  console.log(`2. Deleting checkin ${checkin.id}...`);
  await checkinService.deleteCheckin(checkin.id);

  // Re-query Job Cards (simulating refresh)
  console.log("3. Re-querying Job Cards (simulating page refresh)...");
  jobs = await jobService.getJobs({});
  jobFound = jobs.some((j) => j.id === checkin.jobCardId);
  console.log(`Job Card exists after deletion & refresh? ${jobFound} (Expected: false)`);

  const dbJob = await db.job.findFirst({ where: { id: checkin.jobCardId, isDeleted: false } });
  console.log(`DB direct check for non-deleted job with ID=${checkin.jobCardId}:`, dbJob);

  if (!jobFound && !dbJob) {
    console.log("\n>>> SUCCESS: Job Card is permanently removed and does not reappear on refresh! <<<");
  } else {
    console.error("\n>>> FAILURE: Job Card still exists after deletion! <<<");
    process.exit(1);
  }
}

runTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });
