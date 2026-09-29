import { db } from "../src/lib/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";
import { resolveUserPermissions } from "../src/lib/auth.js";

async function main() {
  console.log("=== Starting Data Isolation & Scoping E2E Verification ===");

  // 1. Setup Test Franchises
  const franA = await db.franchise.upsert({
    where: { id: "FRAN-TEST-A" },
    update: { name: "Franchise Test Alpha", status: "Active" },
    create: {
      id: "FRAN-TEST-A",
      name: "Franchise Test Alpha",
      status: "Active",
      city: "Chennai",
      owner: "Alpha Owner",
      phone: "9876543210",
      since: new Date(),
      revenue: 0,
      jobs: 0,
      royaltyPct: 10,
      address: "123 Alpha St",
      state: "TN",
      pinCode: "600001",
    }
  });

  const franB = await db.franchise.upsert({
    where: { id: "FRAN-TEST-B" },
    update: { name: "Franchise Test Beta", status: "Active" },
    create: {
      id: "FRAN-TEST-B",
      name: "Franchise Test Beta",
      status: "Active",
      city: "Bangalore",
      owner: "Beta Owner",
      phone: "9876543211",
      since: new Date(),
      revenue: 0,
      jobs: 0,
      royaltyPct: 10,
      address: "456 Beta Rd",
      state: "KA",
      pinCode: "560001",
    }
  });
  console.log("Franchises initialized: FRAN-TEST-A, FRAN-TEST-B");

  const passwordHash = await bcrypt.hash("password123", 10);

  // 2. Setup Test Employees / Admins
  const empA = await db.employee.upsert({
    where: { id: "EMP-TEST-A1" },
    update: { franchiseId: "FRAN-TEST-A", role: "FRANCHISE_ADMIN", status: "Active", approvalStatus: "Approved" },
    create: {
      id: "EMP-TEST-A1",
      name: "Admin Alpha",
      username: "admin_alpha",
      password: passwordHash,
      role: "FRANCHISE_ADMIN",
      franchiseId: "FRAN-TEST-A",
      status: "Active",
      approvalStatus: "Approved",
    }
  });

  const empB = await db.employee.upsert({
    where: { id: "EMP-TEST-B1" },
    update: { franchiseId: "FRAN-TEST-B", role: "FRANCHISE_ADMIN", status: "Active", approvalStatus: "Approved" },
    create: {
      id: "EMP-TEST-B1",
      name: "Admin Beta",
      username: "admin_beta",
      password: passwordHash,
      role: "FRANCHISE_ADMIN",
      franchiseId: "FRAN-TEST-B",
      status: "Active",
      approvalStatus: "Approved",
    }
  });

  const empNoFran = await db.employee.upsert({
    where: { id: "EMP-TEST-NOFRAN" },
    update: { franchiseId: null, role: "FRANCHISE_ADMIN", status: "Active", approvalStatus: "Approved" },
    create: {
      id: "EMP-TEST-NOFRAN",
      name: "Admin NoFran",
      username: "admin_nofran",
      password: passwordHash,
      role: "FRANCHISE_ADMIN",
      franchiseId: null,
      status: "Active",
      approvalStatus: "Approved",
    }
  });
  console.log("Test employees initialized.");

  // 3. Create Scoped Operational Records
  // Franchise A records
  const custA = await db.customer.upsert({
    where: { id: "CUST-TEST-A" },
    update: { franchiseId: "FRAN-TEST-A", isDeleted: false },
    create: {
      id: "CUST-TEST-A",
      name: "Customer Alpha",
      phone: "9990000001",
      email: "cust_a@test.com",
      vehicle: "TN01AA1111",
      model: "Honda City",
      visits: 1,
      totalSpend: 5000,
      lastVisit: new Date(),
      franchiseId: "FRAN-TEST-A",
    }
  });

  const carInA = await db.carIn.upsert({
    where: { id: "CARIN-TEST-A" },
    update: { franchiseId: "FRAN-TEST-A", isDeleted: false },
    create: {
      id: "CARIN-TEST-A",
      vehicle: "TN01AA1111",
      model: "Honda City",
      customer: "Customer Alpha",
      phone: "9990000001",
      service: "General Service",
      inTime: new Date(),
      status: "In Progress",
      odometer: "15000",
      notes: "Alpha checkin",
      jobCardId: "JOB-TEST-A",
      franchiseId: "FRAN-TEST-A",
    }
  });

  const jobA = await db.job.upsert({
    where: { id: "JOB-TEST-A" },
    update: { franchiseId: "FRAN-TEST-A", isDeleted: false },
    create: {
      id: "JOB-TEST-A",
      vehicle: "TN01AA1111",
      customer: "Customer Alpha",
      service: "General Service",
      technician: "Tech A",
      status: "In Progress",
      priority: "Normal",
      startDate: new Date(),
      estCompletion: new Date(),
      notes: "Alpha job",
      franchiseId: "FRAN-TEST-A",
      isDeleted: false,
    }
  });

  const invA = await db.invoice.upsert({
    where: { id: "INV-TEST-A" },
    update: { franchiseId: "FRAN-TEST-A", isDeleted: false },
    create: {
      id: "INV-TEST-A",
      type: "Tax Invoice",
      client: "Customer Alpha",
      phone: "9990000001",
      vehicle: "TN01AA1111",
      service: "General Service",
      amount: 5000,
      gst: 900,
      discount: 0,
      status: "Paid",
      date: new Date(),
      dueDate: new Date(),
      notes: "Alpha invoice",
      franchiseId: "FRAN-TEST-A",
      isDeleted: false,
    }
  });

  // Franchise B records
  const custB = await db.customer.upsert({
    where: { id: "CUST-TEST-B" },
    update: { franchiseId: "FRAN-TEST-B", isDeleted: false },
    create: {
      id: "CUST-TEST-B",
      name: "Customer Beta",
      phone: "9990000002",
      email: "cust_b@test.com",
      vehicle: "KA01BB2222",
      model: "Hyundai i20",
      visits: 3,
      totalSpend: 12000,
      lastVisit: new Date(),
      franchiseId: "FRAN-TEST-B",
    }
  });

  const carInB = await db.carIn.upsert({
    where: { id: "CARIN-TEST-B" },
    update: { franchiseId: "FRAN-TEST-B", isDeleted: false },
    create: {
      id: "CARIN-TEST-B",
      vehicle: "KA01BB2222",
      model: "Hyundai i20",
      customer: "Customer Beta",
      phone: "9990000002",
      service: "Major Service",
      inTime: new Date(),
      status: "Completed",
      odometer: "35000",
      notes: "Beta checkin",
      jobCardId: "JOB-TEST-B",
      franchiseId: "FRAN-TEST-B",
    }
  });

  const jobB = await db.job.upsert({
    where: { id: "JOB-TEST-B" },
    update: { franchiseId: "FRAN-TEST-B", isDeleted: false },
    create: {
      id: "JOB-TEST-B",
      vehicle: "KA01BB2222",
      customer: "Customer Beta",
      service: "Major Service",
      technician: "Tech B",
      status: "Completed",
      priority: "High",
      startDate: new Date(),
      estCompletion: new Date(),
      notes: "Beta job",
      franchiseId: "FRAN-TEST-B",
      isDeleted: false,
    }
  });

  const invB = await db.invoice.upsert({
    where: { id: "INV-TEST-B" },
    update: { franchiseId: "FRAN-TEST-B", isDeleted: false },
    create: {
      id: "INV-TEST-B",
      type: "Tax Invoice",
      client: "Customer Beta",
      phone: "9990000002",
      vehicle: "KA01BB2222",
      service: "Major Service",
      amount: 12000,
      gst: 2160,
      discount: 500,
      status: "Paid",
      date: new Date(),
      dueDate: new Date(),
      notes: "Beta invoice",
      franchiseId: "FRAN-TEST-B",
      isDeleted: false,
    }
  });
  console.log("Operational records created for Franchise A and Franchise B.");

  // Helper to generate a valid auth token with active DB session
  async function createTokenForUser(emp: any) {
    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.session.create({
      data: {
        jti,
        employeeId: emp.id,
        expiresAt,
      }
    });
    const permissions = await resolveUserPermissions(emp.id, emp.role);
    const token = jwt.sign(
      {
        id: emp.id,
        username: emp.username,
        role: emp.role,
        permissions,
        franchiseId: emp.franchiseId,
        hqControlled: emp.hqControlled,
        jti,
      },
      env.JWT_SECRET as string,
      { expiresIn: "1d" }
    );
    return token;
  }

  const superAdmin = await db.employee.findUniqueOrThrow({ where: { id: "HQ-001" } });
  const superToken = await createTokenForUser(superAdmin);
  const tokenA = await createTokenForUser(empA);
  const tokenB = await createTokenForUser(empB);
  const tokenNoFran = await createTokenForUser(empNoFran);

  const BASE_URL = "http://localhost:5000/api";

  console.log("\n--- Testing Franchise A Dashboard (admin_alpha) ---");
  const resA = await fetch(`${BASE_URL}/dashboard`, {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  if (!resA.ok) throw new Error(`Dashboard A failed: ${resA.status} ${await resA.text()}`);
  const dataA = await resA.json();
  console.log("Franchise A Dashboard Response:", JSON.stringify(dataA, null, 2));

  // Assertions for Franchise A
  const crmA = (dataA as any).crm;
  const workshopA = (dataA as any).workshop;
  const financeA = (dataA as any).financial;

  if (crmA.newCustomers !== 1) throw new Error(`Expected 1 new customer for Franchise A, got ${crmA.newCustomers}`);
  if (crmA.returningCustomers !== 0) throw new Error(`Expected 0 returning customers for Franchise A, got ${crmA.returningCustomers}`);
  if (workshopA.carsReceivedToday !== 1) throw new Error(`Expected 1 car received for Franchise A, got ${workshopA.carsReceivedToday}`);
  if (workshopA.vehiclesInProgress !== 1) throw new Error(`Expected 1 vehicle in progress for Franchise A, got ${workshopA.vehiclesInProgress}`);
  if (workshopA.vehiclesReady !== 0) throw new Error(`Expected 0 vehicles ready for Franchise A, got ${workshopA.vehiclesReady}`);
  if (financeA.revenueToday !== 5900) throw new Error(`Expected 5900 revenue today for Franchise A, got ${financeA.revenueToday}`);
  console.log("✅ Franchise A Dashboard metrics isolated successfully!");

  console.log("\n--- Testing Franchise A attempting to pass ?franchiseId=FRAN-TEST-B (tampering check) ---");
  const resATamper = await fetch(`${BASE_URL}/dashboard?franchiseId=FRAN-TEST-B`, {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const dataATamper = await resATamper.json();
  if ((dataATamper as any).financial?.revenueToday !== 5900) {
    throw new Error(`Tampering exploit detected! Franchise A saw non-A revenue: ${(dataATamper as any).financial?.revenueToday}`);
  }
  console.log("✅ Parameter tampering blocked: Franchise A cannot view Franchise B data via query param!");

  console.log("\n--- Testing Franchise B Dashboard (admin_beta) ---");
  const resB = await fetch(`${BASE_URL}/dashboard`, {
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  if (!resB.ok) throw new Error(`Dashboard B failed: ${resB.status} ${await resB.text()}`);
  const dataB = await resB.json();
  console.log("Franchise B Dashboard Response:", JSON.stringify(dataB, null, 2));

  const crmB = (dataB as any).crm;
  const workshopB = (dataB as any).workshop;
  const financeB = (dataB as any).financial;

  if (crmB.newCustomers !== 0) throw new Error(`Expected 0 new customers for Franchise B, got ${crmB.newCustomers}`);
  if (crmB.returningCustomers !== 1) throw new Error(`Expected 1 returning customer for Franchise B, got ${crmB.returningCustomers}`);
  if (workshopB.carsReceivedToday !== 1) throw new Error(`Expected 1 car received for Franchise B, got ${workshopB.carsReceivedToday}`);
  if (workshopB.vehiclesInProgress !== 0) throw new Error(`Expected 0 vehicle in progress for Franchise B, got ${workshopB.vehiclesInProgress}`);
  if (workshopB.vehiclesReady !== 1) throw new Error(`Expected 1 vehicle ready for Franchise B, got ${workshopB.vehiclesReady}`);
  if (financeB.revenueToday !== 13660) throw new Error(`Expected 13660 revenue today for Franchise B, got ${financeB.revenueToday}`);
  console.log("✅ Franchise B Dashboard metrics isolated successfully!");

  console.log("\n--- Testing Non-HQ User with Null Franchise (admin_nofran) ---");
  const resNoFran = await fetch(`${BASE_URL}/dashboard`, {
    headers: { Authorization: `Bearer ${tokenNoFran}` }
  });
  const dataNoFran = await resNoFran.json();
  console.log("Admin NoFran Dashboard Response:", JSON.stringify(dataNoFran, null, 2));

  if ((dataNoFran as any).crm.newCustomers !== 0 || (dataNoFran as any).crm.returningCustomers !== 0) {
    throw new Error("Admin with null franchise must NOT see any customers!");
  }
  if ((dataNoFran as any).financial.revenueToday !== 0) {
    throw new Error("Admin with null franchise must NOT see any revenue!");
  }
  if ((dataNoFran as any).workshop.carsReceivedToday !== 0) {
    throw new Error("Admin with null franchise must NOT see any vehicles!");
  }
  console.log("✅ Null-franchise handling verified: 0 rows returned, no Super Admin data leak!");

  console.log("\n--- Testing Super Admin Global Dashboard ---");
  const resSuper = await fetch(`${BASE_URL}/dashboard`, {
    headers: { Authorization: `Bearer ${superToken}` }
  });
  if (!resSuper.ok) throw new Error(`Super Admin Dashboard failed: ${resSuper.status} ${await resSuper.text()}`);
  const dataSuper = await resSuper.json();
  console.log("Super Admin Global Revenue Today:", (dataSuper as any).financial?.revenueToday);
  console.log("Super Admin Global Cars Received:", (dataSuper as any).workshop?.carsReceivedToday);

  // Super Admin should see both Franchise A and Franchise B revenue (5900 + 13660 = 19560)
  if ((dataSuper as any).financial?.revenueToday < 19560) {
    throw new Error(`Super Admin should see combined revenue >= 19560, got ${(dataSuper as any).financial?.revenueToday}`);
  }
  if ((dataSuper as any).workshop?.carsReceivedToday < 2) {
    throw new Error(`Super Admin should see combined cars received >= 2, got ${(dataSuper as any).workshop?.carsReceivedToday}`);
  }
  console.log("✅ Super Admin global view preserved across all franchises!");

  console.log("\n--- Testing Super Admin Filtered by Franchise A (?franchiseId=FRAN-TEST-A) ---");
  const resSuperFilterA = await fetch(`${BASE_URL}/dashboard?franchiseId=FRAN-TEST-A`, {
    headers: { Authorization: `Bearer ${superToken}` }
  });
  const dataSuperFilterA = await resSuperFilterA.json();
  if ((dataSuperFilterA as any).financial?.revenueToday !== 5900) {
    throw new Error(`Super Admin filtered by Franchise A expected 5900, got ${(dataSuperFilterA as any).financial?.revenueToday}`);
  }
  console.log("✅ Super Admin optional franchise filtering works properly!");

  console.log("\n--- Testing Cross-Franchise Customer API Access ---");
  const custResCross = await fetch(`${BASE_URL}/customers/CUST-TEST-B`, {
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  if (custResCross.status !== 404 && custResCross.status !== 403) {
    throw new Error(`Expected 403/404 for cross-franchise customer access, got ${custResCross.status}`);
  }
  console.log(`✅ Cross-franchise customer access blocked with status: ${custResCross.status}`);

  console.log("\n--- Testing Cross-Franchise CarIn Access ---");
  const carinListA = await (await fetch(`${BASE_URL}/carin`, { headers: { Authorization: `Bearer ${tokenA}` } })).json();
  const foundBInA = (carinListA as any[]).some(c => c.franchiseId === "FRAN-TEST-B" || c.id === "CARIN-TEST-B");
  if (foundBInA) {
    throw new Error("Franchise A checkins list contains Franchise B record!");
  }
  console.log("✅ Cross-franchise vehicle checkins blocked: Franchise A only sees Franchise A vehicles!");

  console.log("\n--- Testing Cross-Franchise OutPass Access ---");
  const outpassListA = await (await fetch(`${BASE_URL}/outpass`, { headers: { Authorization: `Bearer ${tokenA}` } })).json();
  const foundBInOutpassA = (outpassListA as any[]).some(o => o.franchiseId === "FRAN-TEST-B");
  if (foundBInOutpassA) {
    throw new Error("Franchise A outpass list contains Franchise B record!");
  }
  console.log("✅ Cross-franchise outpass blocked: Franchise A only sees Franchise A outpasses!");

  console.log("\n🎉 ALL DATA ISOLATION AND SCOPING TESTS PASSED PERFECTLY! 🎉\n");
}

main()
  .catch((err) => {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
