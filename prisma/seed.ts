import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcrypt";


dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding Shifterz database...");

  // Clean old data
  await prisma.attendance.deleteMany();
  await prisma.userPermission.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.inventoryRequest.deleteMany();
  await prisma.leadAssignmentHistory.deleteMany();
  await prisma.leadFollowUp.deleteMany();
  await prisma.leadTransferHistory.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.outPass.deleteMany();
  await prisma.warranty.deleteMany();
  await prisma.jobHistory.deleteMany();
  await prisma.qCInspection.deleteMany();
  await prisma.job.deleteMany();
  await prisma.carIn.deleteMany();
  await prisma.inventoryMovement.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.service.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.franchise.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.workflowStage.deleteMany();
  await prisma.qCChecklistTemplate.deleteMany();

  // Super Admin — the only account this seed creates. Everything else
  // (franchises, staff, services, inventory, settings, role permissions,
  // workflow stages, QC checklist template) is created by the Super Admin
  // through the app itself, not pre-seeded demo data.
  const defaultPassword = await bcrypt.hash("password123", 10);
  await prisma.employee.create({
    data: { id: "HQ-001", name: "Super Admin", username: "superadmin", password: defaultPassword, role: "SUPER_ADMIN" },
  });

  // Seed default role permissions
  const DEFAULT_ROLES: Record<string, string[]> = {
    SUPER_ADMIN: ["dashboard", "carin", "jobs", "vehicle-inspection", "qc", "outpass", "leads", "customers", "billing", "payments", "inventory", "reports", "employees", "attendance", "settings", "roles"],
    HQ_USER: ["dashboard", "carin", "jobs", "vehicle-inspection", "qc", "outpass", "leads", "customers", "billing", "payments", "inventory", "reports", "employees", "attendance", "settings"],
    FRANCHISE_ADMIN: ["dashboard", "carin", "jobs", "vehicle-inspection", "qc", "outpass", "leads", "customers", "billing", "payments", "inventory", "reports", "employees", "attendance"],
    BRANCH_MANAGER: ["dashboard", "carin", "jobs", "vehicle-inspection", "qc", "outpass", "leads", "customers", "billing", "payments", "inventory", "reports", "attendance"],
    RECEPTION_EXECUTIVE: ["dashboard", "carin", "outpass", "customers", "leads", "attendance"],
    SERVICE_ADVISOR: ["dashboard", "carin", "jobs"],
    TECHNICIAN: ["dashboard", "jobs", "attendance"],
    QUALITY_INSPECTOR: ["dashboard", "vehicle-inspection", "qc"],
    BILLING_EXECUTIVE: ["dashboard", "billing", "payments", "reports"],
    INVENTORY_EXECUTIVE: ["dashboard", "inventory", "reports"],
  };

  for (const [role, permissions] of Object.entries(DEFAULT_ROLES)) {
    await prisma.rolePermission.upsert({
      where: { role },
      update: { permissions },
      create: { role, permissions },
    });
  }

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
