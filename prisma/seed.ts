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

  // Role Permissions Seed Matrix
  const DEFAULT_MATRIX = {
    SUPER_ADMIN: ["dashboard", "franchise", "employees", "customers", "leads", "appointments", "carin", "jobs", "workshop", "qc", "billing", "payments", "inventory", "reports", "settings", "roles"],
    HQ_OPERATIONS: ["dashboard", "franchise", "employees", "customers", "leads", "appointments", "carin", "jobs", "workshop", "inventory", "reports"],
    HQ_INVENTORY: ["dashboard", "franchise", "inventory", "reports", "requests"],
    HQ_ACCOUNTS: ["dashboard", "franchise", "customers", "billing", "payments", "reports"],
    FRANCHISE_ADMIN: ["dashboard", "employees", "customers", "leads", "appointments", "carin", "jobs", "workshop", "qc", "billing", "payments", "inventory", "reports", "settings"],
    RECEPTION_EXECUTIVE: ["dashboard", "customers", "leads", "appointments", "carin", "jobs"],
    SERVICE_ADVISOR: ["dashboard", "customers", "leads", "appointments", "carin", "jobs", "workshop", "inventory", "reports"],
    TECHNICIAN: ["dashboard", "jobs", "workshop", "inventory", "reports"],
    QUALITY_INSPECTOR: ["dashboard", "customers", "jobs", "qc"],
    BILLING_EXECUTIVE: ["dashboard", "jobs", "billing", "payments", "reports"],
  };

  await prisma.rolePermission.createMany({
    data: Object.entries(DEFAULT_MATRIX).map(([role, permissions]) => ({
      role,
      permissions,
    })),
  });
  await prisma.attendance.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.inventoryRequest.deleteMany();
  await prisma.employee.deleteMany();
  // Settings
  await prisma.setting.create({
    data: {
      id: "default",
      companyName: "Shifterz",
      address: "42, Race Course Rd, Coimbatore – 641018",
      phone: "0422-123 4567",
      email: "info@shifterz.in",
      gstin: "33AAAAA0000A1Z5",
      gstPct: 18,
      currency: "₹",
      agents: ["Arjun", "Sathish", "Mani"],
    },
  });

  // Employees (HQ)
  const defaultPassword = await bcrypt.hash("password123", 10);
  await prisma.employee.createMany({
    data: [
      { id: "HQ-001", name: "Super Admin", username: "superadmin", password: defaultPassword, role: "SUPER_ADMIN" },
      { id: "HQ-002", name: "HQ Ops Manager", username: "hqops", password: defaultPassword, role: "HQ_OPERATIONS" },
      { id: "HQ-003", name: "HQ Inv Manager", username: "hqinv", password: defaultPassword, role: "HQ_INVENTORY" },
      { id: "HQ-004", name: "HQ Acc Manager", username: "hqacc", password: defaultPassword, role: "HQ_ACCOUNTS" },
    ]
  });




  // Services
  await prisma.service.createMany({
    data: [
      { id: "SVC001", name: "PPF Full Body", category: "PPF", price: 45000, duration: "2 days", warranty: "10 years", desc: "Full body paint protection film" },
      { id: "SVC002", name: "PPF Bonnet + Roof", category: "PPF", price: 18000, duration: "4 hours", warranty: "10 years", desc: "" },
      { id: "SVC003", name: "PPF Partial (Hood)", category: "PPF", price: 8000, duration: "2 hours", warranty: "10 years", desc: "" },
      { id: "SVC004", name: "C3 Pro Coating", category: "Coating", price: 22000, duration: "1 day", warranty: "3 years", desc: "CarPro C3 professional coating" },
      { id: "SVC005", name: "Ceramic Coating", category: "Coating", price: 18000, duration: "1 day", warranty: "2 years", desc: "" },
      { id: "SVC006", name: "Graphene Coating", category: "Coating", price: 35000, duration: "2 days", warranty: "5 years", desc: "Premium graphene-infused coating" },
      { id: "SVC007", name: "Interior Detailing", category: "Detailing", price: 8500, duration: "5 hours", warranty: "—", desc: "" },
      { id: "SVC008", name: "Paint Correction (1-step)", category: "Detailing", price: 12000, duration: "8 hours", warranty: "—", desc: "" },
      { id: "SVC009", name: "Full Paint Correction", category: "Detailing", price: 22000, duration: "2 days", warranty: "—", desc: "" },
      { id: "SVC010", name: "Window Tinting", category: "Add-on", price: 12000, duration: "3 hours", warranty: "3 years", desc: "" },
    ],
  });


  // Note: Inventory is intentionally left empty. Items are franchise-scoped
  // (see Inventory.franchiseId) and should be added per-franchise via the
  // Inventory module, not seeded globally as demo data.

  // Default Workshop Stages (PRD 10.5)
  await prisma.workflowStage.createMany({
    data: [
      { name: "Assigned", order: 1, isDefault: true },
      { name: "Work Started", order: 2, isDefault: true },
      { name: "Surface Preparation", order: 3, isDefault: true },
      { name: "Service In Progress", order: 4, isDefault: true },
      { name: "Waiting for Customer Approval", order: 5, isDefault: true },
      { name: "Waiting for Material", order: 6, isDefault: true },
      { name: "Work Completed", order: 7, isDefault: true },
      { name: "Sent for Quality Check", order: 8, isDefault: true },
    ],
  });

  // Default QC Checklist Template (PRD 12.4)
  await prisma.qCChecklistTemplate.createMany({
    data: [
      { category: "Exterior", label: "Paint Finish Verified", order: 1, isDefault: true },
      { category: "Exterior", label: "Wax / Coating Completed", order: 2, isDefault: true },
      { category: "Exterior", label: "Water Spots Removed", order: 3, isDefault: true },
      { category: "Exterior", label: "Tyres Cleaned", order: 4, isDefault: true },
      { category: "Exterior", label: "Glass Cleaned", order: 5, isDefault: true },
      { category: "Interior", label: "Dashboard Cleaned", order: 1, isDefault: true },
      { category: "Interior", label: "Seats Cleaned", order: 2, isDefault: true },
      { category: "Interior", label: "Floor Mats Cleaned", order: 3, isDefault: true },
      { category: "Interior", label: "Vacuum Completed", order: 4, isDefault: true },
      { category: "Interior", label: "Interior Odour Checked", order: 5, isDefault: true },
      { category: "Accessories", label: "Accessories Returned", order: 1, isDefault: true },
      { category: "Accessories", label: "Spare Wheel Available", order: 2, isDefault: true },
      { category: "Accessories", label: "Toolkit Available", order: 3, isDefault: true },
      { category: "Accessories", label: "Documents Available", order: 4, isDefault: true },
      { category: "Final Inspection", label: "Vehicle Cleanliness", order: 1, isDefault: true },
      { category: "Final Inspection", label: "Customer Requested Services Completed", order: 2, isDefault: true },
      { category: "Final Inspection", label: "No New Damage", order: 3, isDefault: true },
      { category: "Final Inspection", label: "Vehicle Ready for Delivery", order: 4, isDefault: true },
    ],
  });

  // Franchise
  await prisma.franchise.createMany({
    data: [
      { id: "F001", name: "Shifterz Chennai", city: "Chennai", owner: "Balaji S", phone: "98400 11111", since: new Date("2024-01-15"), revenue: 380000, jobs: 48, royaltyPct: 5, status: "Active" },
      { id: "F002", name: "Shifterz Bangalore", city: "Bangalore", owner: "Ravi Kumar", phone: "98400 22222", since: new Date("2024-04-10"), revenue: 520000, jobs: 65, royaltyPct: 5, status: "Active" },
      { id: "F003", name: "Shifterz Hyderabad", city: "Hyderabad", owner: "Anand P", phone: "98400 33333", since: new Date("2024-07-20"), revenue: 290000, jobs: 38, royaltyPct: 5, status: "Active" },
      { id: "F004", name: "Shifterz Pune", city: "Pune", owner: "Suresh M", phone: "98400 44444", since: new Date("2024-11-01"), revenue: 140000, jobs: 22, royaltyPct: 5, status: "Trial" },
      { id: "F005", name: "Shifterz Kochi", city: "Kochi", owner: "Jithin K", phone: "98400 55555", since: new Date("2025-02-14"), revenue: 95000, jobs: 15, royaltyPct: 5, status: "Trial" },
    ],
  });

  // Franchise Employees
  await prisma.employee.createMany({
    data: [
      { id: "FRA-001", name: "Franchise Admin", username: "franchiseadmin", password: defaultPassword, role: "FRANCHISE_ADMIN", franchiseId: "F001" },
      { id: "REC-001", name: "Reception Exec", username: "reception", password: defaultPassword, role: "RECEPTION_EXECUTIVE", franchiseId: "F001" },
      { id: "SA-001", name: "Service Advisor", username: "advisor", password: defaultPassword, role: "SERVICE_ADVISOR", franchiseId: "F001" },
      { id: "TECH-001", name: "Technician 1", username: "tech1", password: defaultPassword, role: "TECHNICIAN", franchiseId: "F001" },
      { id: "TECH-002", name: "Technician 2", username: "tech2", password: defaultPassword, role: "TECHNICIAN", franchiseId: "F001" },
      { id: "QC-001", name: "Quality Inspector", username: "qc", password: defaultPassword, role: "QUALITY_INSPECTOR", franchiseId: "F001" },
      { id: "BIL-001", name: "Billing Exec", username: "billing", password: defaultPassword, role: "BILLING_EXECUTIVE", franchiseId: "F001" },
    ],
  });



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
