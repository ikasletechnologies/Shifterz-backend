import { db } from "../src/lib/db.js";
import { qualityInspectorSidebarSections } from "../../Shifterz-frontend/src/components/layout/Sidebar.js";
import { canAccessModule, getModuleForRoute } from "../../Shifterz-frontend/src/lib/permissions.js";

const BACKEND_URL = "http://localhost:5000";

async function login(username: string, password: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Login failed for ${username}: ${res.status} ${text}`);
  }
  const cookies = res.headers.get("set-cookie") || "";
  const data = await res.json();
  return { data, cookies };
}

async function getRolePermissions(cookies: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/roles/permissions`, {
    headers: { Cookie: cookies },
  });
  return res.json();
}

async function updateRolePermissions(role: string, permissions: string[], cookies: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/roles/permissions/${role}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies,
    },
    body: JSON.stringify({ permissions }),
  });
  return { status: res.status, data: await res.json() };
}

async function getMe(cookies: string) {
  const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
    headers: { Cookie: cookies },
  });
  return { status: res.status, data: await res.json() };
}

async function getQcQueue(cookies: string) {
  const res = await fetch(`${BACKEND_URL}/api/qc/queue`, {
    headers: { Cookie: cookies },
  });
  return { status: res.status, data: await res.json() };
}

async function getVehicleInspection(cookies: string) {
  const res = await fetch(`${BACKEND_URL}/api/carin`, {
    headers: { Cookie: cookies },
  });
  return { status: res.status, data: await res.json() };
}

async function runTests() {
  console.log("==================================================");
  console.log("STARTING QC & QUALITY INSPECTOR RBAC VERIFICATION");
  console.log("==================================================");

  // TEST 1: Super Admin Login & Verify Quality Inspector Permissions
  console.log("\n[TEST 1] Login as Super Admin & check Quality Inspector permissions...");
  const saAuth = await login("superadmin", "password123");
  const rolePerms = await getRolePermissions(saAuth.cookies);
  const qiRolePerm = rolePerms.find((r: any) => r.role === "QUALITY_INSPECTOR");
  console.log("QUALITY_INSPECTOR role permissions:", qiRolePerm?.permissions);

  if (!qiRolePerm?.permissions.includes("vehicle-inspection") || !qiRolePerm?.permissions.includes("qc")) {
    throw new Error("TEST 1 FAILED: QUALITY_INSPECTOR does not have both vehicle-inspection and qc ON!");
  }
  console.log("✓ TEST 1 PASSED: Vehicle Inspection = ON, QC = ON");

  // TEST 2: Login as Quality Inspector & verify permissions and sidebar visibility
  console.log("\n[TEST 2] Login as Quality Inspector (siva)...");
  const sivaAuth = await login("siva", "siva123");
  console.log("Siva permissions:", sivaAuth.data.user.permissions);
  if (
    !sivaAuth.data.user.permissions.includes("dashboard") ||
    !sivaAuth.data.user.permissions.includes("vehicle-inspection") ||
    !sivaAuth.data.user.permissions.includes("qc")
  ) {
    throw new Error("TEST 2 FAILED: Siva does not have dashboard, vehicle-inspection, and qc!");
  }

  // Verify unauthorized modules are OFF for Quality Inspector
  const forbiddenModules = ["carin", "jobs", "outpass", "leads", "customers", "billing", "payments", "inventory", "roles"];
  for (const m of forbiddenModules) {
    if (sivaAuth.data.user.permissions.includes(m)) {
      throw new Error(`TEST 2 FAILED: Siva unexpectedly has access to ${m}!`);
    }
  }
  console.log("✓ TEST 2 PASSED: Quality Inspector permissions are exactly dashboard, vehicle-inspection, and qc. Other modules are OFF.");

  // TEST 3: Access QC API
  console.log("\n[TEST 3] Quality Inspector accessing QC API (/api/qc/queue)...");
  const qcRes = await getQcQueue(sivaAuth.cookies);
  console.log(`QC queue response status: ${qcRes.status}, data length: ${Array.isArray(qcRes.data) ? qcRes.data.length : 'not an array'}`);
  if (qcRes.status !== 200) {
    throw new Error(`TEST 3 FAILED: /api/qc/queue returned ${qcRes.status}: ${JSON.stringify(qcRes.data)}`);
  }
  console.log("✓ TEST 3 PASSED: QC endpoint is accessible to Quality Inspector (200 OK)");

  // TEST 4: Access Vehicle Inspection API
  console.log("\n[TEST 4] Quality Inspector accessing Vehicle Inspection API...");
  const viRes = await getVehicleInspection(sivaAuth.cookies);
  console.log(`Vehicle inspection response status: ${viRes.status}`);
  if (viRes.status !== 200) {
    throw new Error(`TEST 4 FAILED: Vehicle Inspection returned ${viRes.status}`);
  }
  console.log("✓ TEST 4 PASSED: Vehicle Inspection endpoint is accessible to Quality Inspector (200 OK)");

  // TEST 5: Super Admin turns QC permission OFF for Quality Inspector
  console.log("\n[TEST 5] Super Admin toggling QC OFF for Quality Inspector...");
  const updateOff = await updateRolePermissions("QUALITY_INSPECTOR", ["dashboard", "vehicle-inspection"], saAuth.cookies);
  if (updateOff.status !== 200) {
    throw new Error(`Failed to update permissions: ${updateOff.status}`);
  }

  // Verify /auth/me for siva immediately reflects QC removed
  const sivaMeAfterDisable = await getMe(sivaAuth.cookies);
  console.log("Siva live permissions after QC disabled:", sivaMeAfterDisable.data.user.permissions);
  if (sivaMeAfterDisable.data.user.permissions.includes("qc")) {
    throw new Error("TEST 5 FAILED: Siva still has qc permission after disabling!");
  }

  // Verify protected QC API call is blocked
  const qcResBlocked = await getQcQueue(sivaAuth.cookies);
  console.log(`QC API status after disabling: ${qcResBlocked.status}`);
  if (qcResBlocked.status !== 403) {
    throw new Error(`TEST 5 FAILED: Expected 403 Forbidden on /api/qc/queue, got ${qcResBlocked.status}`);
  }
  console.log("✓ TEST 5 PASSED: Turning QC OFF immediately removes permission and blocks API with 403 Forbidden");

  // TEST 6: Super Admin turns QC permission back ON
  console.log("\n[TEST 6] Super Admin toggling QC back ON for Quality Inspector...");
  const updateOn = await updateRolePermissions("QUALITY_INSPECTOR", ["dashboard", "vehicle-inspection", "qc"], saAuth.cookies);
  if (updateOn.status !== 200) {
    throw new Error(`Failed to restore permissions: ${updateOn.status}`);
  }

  const sivaMeAfterRestore = await getMe(sivaAuth.cookies);
  console.log("Siva live permissions after QC restored:", sivaMeAfterRestore.data.user.permissions);
  if (!sivaMeAfterRestore.data.user.permissions.includes("qc")) {
    throw new Error("TEST 6 FAILED: Siva does not have qc permission after restoring!");
  }

  const qcResRestored = await getQcQueue(sivaAuth.cookies);
  console.log(`QC API status after restoring: ${qcResRestored.status}`);
  if (qcResRestored.status !== 200) {
    throw new Error(`TEST 6 FAILED: Expected 200 OK on /api/qc/queue, got ${qcResRestored.status}`);
  }
  console.log("✓ TEST 6 PASSED: Turning QC back ON immediately restores access (200 OK)");

  // TEST 7: Super Admin full access
  console.log("\n[TEST 7] Checking Super Admin full access...");
  const saMe = await getMe(saAuth.cookies);
  const saQc = await getQcQueue(saAuth.cookies);
  if (saQc.status !== 200) {
    throw new Error(`TEST 7 FAILED: Super Admin got ${saQc.status} on /api/qc/queue`);
  }
  console.log("✓ TEST 7 PASSED: Super Admin retains full access (200 OK)");

  // TEST 8: Verify Service Advisor permissions
  console.log("\n[TEST 8] Checking Service Advisor (ramya) permissions...");
  const saRole = rolePerms.find((r: any) => r.role === "SERVICE_ADVISOR");
  console.log("SERVICE_ADVISOR permissions in matrix:", saRole?.permissions);
  if (!saRole?.permissions.includes("jobs") || !saRole?.permissions.includes("carin")) {
    throw new Error("TEST 8 FAILED: Service Advisor permissions were modified!");
  }
  console.log("✓ TEST 8 PASSED: Service Advisor permissions are intact");

  // TEST 9: Verify Technician permissions
  console.log("\n[TEST 9] Checking Technician permissions...");
  const techRole = rolePerms.find((r: any) => r.role === "TECHNICIAN");
  console.log("TECHNICIAN permissions in matrix:", techRole?.permissions);
  if (!techRole?.permissions.includes("jobs") || !techRole?.permissions.includes("attendance")) {
    throw new Error("TEST 9 FAILED: Technician permissions were modified!");
  }
  console.log("✓ TEST 9 PASSED: Technician permissions are intact");

  // TEST 10: Verify no duplicate records
  console.log("\n[TEST 10] Checking for duplicate roles, users, or permissions in DB...");
  const qiEmployees = await db.employee.findMany({
    where: { role: "QUALITY_INSPECTOR" }
  });
  console.log(`Total Quality Inspector employees: ${qiEmployees.length}`);
  if (qiEmployees.length !== 1) {
    throw new Error(`TEST 10 FAILED: Expected exactly 1 Quality Inspector, found ${qiEmployees.length}`);
  }

  const qiRolePerms = await db.rolePermission.findMany({
    where: { role: "QUALITY_INSPECTOR" }
  });
  console.log(`Total QUALITY_INSPECTOR rolePermission rows: ${qiRolePerms.length}`);
  if (qiRolePerms.length !== 1) {
    throw new Error(`TEST 10 FAILED: Expected exactly 1 rolePermission row, found ${qiRolePerms.length}`);
  }
  console.log("✓ TEST 10 PASSED: No duplicate roles, users, or permissions exist");

  console.log("\n==================================================");
  console.log("ALL 10 TEST CASES PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
}).finally(() => process.exit(0));
