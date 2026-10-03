import { db } from "../src/lib/db.js";
import { FALLBACK_ROLE_MATRIX, ALL_MODULES } from "../src/lib/auth.js";

async function main() {
  console.log("=== Seeding Role Permissions into Database ===");

  for (const [role, permissions] of Object.entries(FALLBACK_ROLE_MATRIX)) {
    const perms = role === "SUPER_ADMIN" ? ALL_MODULES : permissions;
    const res = await db.rolePermission.upsert({
      where: { role },
      update: { permissions: perms },
      create: { role, permissions: perms },
    });
    console.log(`Synced ${role}: ${res.permissions.length} modules`);
  }

  // Update siva (QUALITY_INSPECTOR) userPermission in the DB
  const siva = await db.employee.findUnique({
    where: { username: "siva" },
    include: { permission: true }
  });

  if (siva) {
    await db.userPermission.upsert({
      where: { employeeId: siva.id },
      update: { modules: ["dashboard", "vehicle-inspection"] },
      create: { employeeId: siva.id, modules: ["dashboard", "vehicle-inspection"] },
    });
    console.log("Updated Siva (QUALITY_INSPECTOR) userPermission to ['dashboard', 'vehicle-inspection']");
  }

  console.log("Role permissions seeding completed successfully!");
}

main().catch(console.error).finally(() => db.$disconnect());
