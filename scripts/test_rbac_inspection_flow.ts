import { db } from "../src/lib/db.js";

const BACKEND_URL = "http://localhost:5000/api";

async function runTests() {
  console.log("=== Starting Automated Verification Tests ===");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`[PASS] ${msg}`);
      passed++;
    } else {
      console.error(`[FAIL] ${msg}`);
      failed++;
    }
  }

  // 1. Super Admin Login
  console.log("\n--- Testing Super Admin Login & Permissions ---");
  const adminLoginRes = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "superadmin", password: "password123" }),
  });
  assert(adminLoginRes.ok, "Super Admin login status 200");
  const adminLoginData = await adminLoginRes.json();
  const adminToken = adminLoginData.token;
  assert(adminLoginData.user?.role === "SUPER_ADMIN", "Super Admin role is SUPER_ADMIN");
  assert(adminLoginData.user?.permissions?.includes("vehicle-inspection"), "Super Admin permissions include vehicle-inspection");

  // Call /auth/me for Super Admin
  const adminMeRes = await fetch(`${BACKEND_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminMeData = await adminMeRes.json();
  const adminPerms = adminMeData.user?.permissions || [];
  assert(adminPerms.includes("vehicle-inspection"), "Super Admin /auth/me includes vehicle-inspection");
  assert(adminPerms.includes("roles"), "Super Admin /auth/me includes roles");
  assert(adminPerms.includes("settings"), "Super Admin /auth/me includes settings");

  // Call GET /auth/roles/permissions
  console.log("\n--- Testing GET /auth/roles/permissions ---");
  const rolesPermRes = await fetch(`${BACKEND_URL}/auth/roles/permissions`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(rolesPermRes.ok, "GET /auth/roles/permissions status 200");
  const rolesPermData = await rolesPermRes.json();
  const roleList = rolesPermData.data || rolesPermData;
  assert(Array.isArray(roleList), "Roles permissions returned as array in data envelope");
  
  const superAdminRole = roleList.find((r: any) => r.role === "SUPER_ADMIN");
  assert(!!superAdminRole, "SUPER_ADMIN exists in role permissions list");
  assert(superAdminRole?.permissions?.includes("vehicle-inspection"), "SUPER_ADMIN role data includes vehicle-inspection");
  assert(superAdminRole?.permissions?.length >= 14, `SUPER_ADMIN has all modules (${superAdminRole?.permissions?.length} modules)`);

  const qiRole = roleList.find((r: any) => r.role === "QUALITY_INSPECTOR");
  assert(!!qiRole, "QUALITY_INSPECTOR exists in role permissions list");
  assert(qiRole?.permissions?.includes("vehicle-inspection"), "QUALITY_INSPECTOR role data includes vehicle-inspection");
  assert(qiRole?.permissions?.includes("dashboard"), "QUALITY_INSPECTOR role data includes dashboard");

  // 2. Quality Inspector Login
  console.log("\n--- Testing Quality Inspector (Siva) Login & Access ---");
  const qiLoginRes = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "siva", password: "siva123" }),
  });
  assert(qiLoginRes.ok, "Quality Inspector login status 200");
  const qiLoginData = await qiLoginRes.json();
  const qiToken = qiLoginData.token;
  assert(qiLoginData.user?.role === "QUALITY_INSPECTOR", "Quality Inspector role is QUALITY_INSPECTOR");
  assert(qiLoginData.user?.permissions?.includes("vehicle-inspection"), "Quality Inspector has vehicle-inspection permission");
  assert(!qiLoginData.user?.permissions?.includes("billing"), "Quality Inspector does NOT have billing permission");
  assert(!qiLoginData.user?.permissions?.includes("roles"), "Quality Inspector does NOT have roles permission");

  // Call /auth/me for Quality Inspector
  const qiMeRes = await fetch(`${BACKEND_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${qiToken}` },
  });
  const qiMeData = await qiMeRes.json();
  const qiPerms = qiMeData.user?.permissions || [];
  assert(qiPerms.includes("vehicle-inspection"), "QI /auth/me includes vehicle-inspection");
  assert(!qiPerms.includes("billing"), "QI /auth/me excludes billing");

  // QI accessing vehicle check-in list (GET /carin)
  console.log("\n--- Testing Quality Inspector Vehicle Inspection List & Perform Inspection ---");
  const qiCarInListRes = await fetch(`${BACKEND_URL}/carin`, {
    headers: { Authorization: `Bearer ${qiToken}` },
  });
  assert(qiCarInListRes.ok, "Quality Inspector can access GET /carin with vehicle-inspection permission");
  const cars = await qiCarInListRes.json();
  assert(Array.isArray(cars) && cars.length > 0, `Cars returned as array with ${cars.length} entries`);

  // Find car CARMUP6O3PCQVFH (or first car)
  const targetCar = cars.find((c: any) => c.id === "CARMUP6O3PCQVFH") || cars[0];
  assert(!!targetCar, `Found target car for inspection: ${targetCar?.id} (${targetCar?.vehicle})`);

  // Perform inspection update via PUT /carin/:id
  const updateRes = await fetch(`${BACKEND_URL}/carin/${targetCar.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${qiToken}`,
    },
    body: JSON.stringify({
      scratches: "Minor scratches on front bumper",
      dents: "None",
      fuelLevel: "50%",
      photoFront: "/uploads/inspection-front.png",
      remarks: "Inspection completed by Quality Inspector Siva",
    }),
  });
  assert(updateRes.ok, "Quality Inspector successfully performed and updated vehicle inspection (PUT /carin/:id)");
  const updatedCar = await updateRes.json();
  assert(updatedCar.scratches === "Minor scratches on front bumper", "Inspection scratches updated in database");
  assert(updatedCar.photoFront === "/uploads/inspection-front.png", "Inspection photoFront updated in database");

  // 3. Test Disabling Vehicle Inspection Permission
  console.log("\n--- Testing Disabling Vehicle Inspection Permission via Roles & Permissions ---");
  const revokeRes = await fetch(`${BACKEND_URL}/auth/roles/permissions/QUALITY_INSPECTOR`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ permissions: ["dashboard"] }),
  });
  assert(revokeRes.ok, "Super Admin revoked vehicle-inspection for QUALITY_INSPECTOR");

  // Re-login as QI to get new token reflecting updated role permissions
  const qiRevokedLoginRes = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "siva", password: "siva123" }),
  });
  const qiRevokedLoginData = await qiRevokedLoginRes.json();
  const qiRevokedToken = qiRevokedLoginData.token;

  // Re-fetch /auth/me for QI
  const qiRevokedMeRes = await fetch(`${BACKEND_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${qiRevokedToken}` },
  });
  const qiRevokedMeData = await qiRevokedMeRes.json();
  assert(!qiRevokedMeData.user?.permissions?.includes("vehicle-inspection"), "QI /auth/me no longer includes vehicle-inspection");

  // Try accessing GET /carin without vehicle-inspection permission
  const qiRevokedCarInRes = await fetch(`${BACKEND_URL}/carin`, {
    headers: { Authorization: `Bearer ${qiRevokedToken}` },
  });
  assert(qiRevokedCarInRes.status === 403, `GET /carin rejected with status 403 when vehicle-inspection is disabled (got ${qiRevokedCarInRes.status})`);

  // 4. Re-enable Vehicle Inspection Permission
  console.log("\n--- Testing Re-enabling Vehicle Inspection Permission ---");
  const grantRes = await fetch(`${BACKEND_URL}/auth/roles/permissions/QUALITY_INSPECTOR`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ permissions: ["dashboard", "vehicle-inspection"] }),
  });
  assert(grantRes.ok, "Super Admin re-granted vehicle-inspection for QUALITY_INSPECTOR");

  const qiRestoredLoginRes = await fetch(`${BACKEND_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "siva", password: "siva123" }),
  });
  const qiRestoredLoginData = await qiRestoredLoginRes.json();
  const qiRestoredToken = qiRestoredLoginData.token;

  const qiRestoredCarInRes = await fetch(`${BACKEND_URL}/carin`, {
    headers: { Authorization: `Bearer ${qiRestoredToken}` },
  });
  assert(qiRestoredCarInRes.ok, "GET /carin successfully allowed (status 200) after re-enabling vehicle-inspection");

  console.log(`\n=== Verification Complete: ${passed} passed, ${failed} failed ===`);
}

runTests().catch(console.error).finally(() => db.$disconnect());
