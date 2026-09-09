import { Router, type Request, type Response } from "express";
import { db } from "../lib/db.js";
import { authenticate as requireAuth, requireRole, requireAction, type AuthRequest } from "../middleware/auth.middleware.js";
import bcrypt from "bcrypt";
import { logAudit } from "../shared/services/audit.service.js";
import { EmployeeService } from "../modules/employee/service/employee.service.js";
import { BillingService } from "../modules/billing/service/billing.service.js";
import { ReportService } from "../modules/report/service/report.service.js";
import { GstPurchaseInvoiceService } from "../modules/gst/service/gstPurchaseInvoice.service.js";
import { attachPurchaseInvoiceSchema } from "../modules/gst/validation/purchaseInvoice.validation.js";
import { isValidPaymentAmount } from "../modules/gst/service/purchaseValidation.helper.js";
import { RoleActionGrantService } from "../shared/rbac/roleActionGrant.service.js";
import { setRoleActionsSchema } from "../shared/rbac/roleActionGrant.validation.js";
import { generateUid } from "../shared/utils/idGenerator.js";

export const hqRouter = Router();

// Secure all routes in this router to SUPER_ADMIN or HQ_USER
hqRouter.use(requireAuth);
hqRouter.use(requireRole("SUPER_ADMIN", "HQ_USER"));

// ═══════════════════════════════════════════════════════════════
// FRANCHISE MANAGEMENT (HQ Only)
// ═══════════════════════════════════════════════════════════════

// Create a new franchise (goes into Pending state; a License is auto-generated and also stays Pending until Super Admin approval)
hqRouter.post("/franchises", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name, city, owner, phone, since, startDate, royaltyPct, royalty, adminPassword,
      businessName, gstNumber, email, address, state, pinCode
    } = req.body;
    const adminUsername: string | undefined = req.body.adminUsername ? String(req.body.adminUsername).trim().toLowerCase() : undefined;

    if (adminUsername) {
      const existing = await db.employee.findFirst({
        where: { username: adminUsername }
      });
      if (existing) {
        if (existing.isDeleted) {
          // Free up the username from the deleted account
          await db.employee.update({
            where: { id: existing.id },
            data: { username: `del_${existing.id}_${existing.username}` }
          });
        } else {
          res.status(400).json({ error: "Username is already taken by another employee/admin" });
          return;
        }
      }
    }

    // Generate a unique franchise ID (e.g. FRA001)
    const count = await db.franchise.count();
    const id = `FRA${String(count + 1).padStart(3, "0")}`;

    // Auto-generate a unique license key (never entered by the user)
    const generateLicenseKey = (): string => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      return `STZ-${segment()}-${segment()}-${segment()}-${segment()}`;
    };

    // Ensure uniqueness — retry on collision (astronomically rare but correct)
    let licenseKey = generateLicenseKey();
    while (await db.license.findUnique({ where: { licenseKey } })) {
      licenseKey = generateLicenseKey();
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 365);

    const { newFranchise, newLicense } = await db.$transaction(async (tx) => {
      const dateVal = since || startDate;
      const franchise = await tx.franchise.create({
        data: {
          id,
          name,
          city,
          owner,
          phone,
          since: dateVal ? new Date(dateVal) : new Date(),
          revenue: 0,
          jobs: 0,
          royaltyPct: Number(royaltyPct !== undefined ? royaltyPct : royalty) || 10.0,
          status: "Active",
          businessName,
          gstNumber,
          email,
          address,
          state,
          pinCode,
          licenseStatus: "Active"
        }
      });

      // Create a linked License record in Pending state
      const license = await tx.license.create({
        data: {
          organizationId: id,
          licenseKey,
          status: "Active",
          maxSuperAdmins: 1,
          maxHQUsers: 6,
          maxFranchiseAdmins: 1,
          maxFranchiseUsers: 6,
          expiryDate,
          features: ["dashboard", "carin", "jobs", "outpass", "leads", "customers", "billing", "payments", "inventory", "reports", "employees", "attendance"],
        }
      });

      if (adminUsername && adminPassword) {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        const userId = `USR${Date.now().toString(36).toUpperCase()}`;
        await tx.employee.create({
          data: {
            id: userId,
            name: adminUsername,
            username: adminUsername,
            password: hashedPassword,
            role: "FRANCHISE_ADMIN",
            franchiseId: id
          }
        });
      }

      return { newFranchise: franchise, newLicense: license };
    });

    res.json({
      ...newFranchise,
      startDate: newFranchise.since ? new Date(newFranchise.since).toISOString().split('T')[0] : "",
      royalty: newFranchise.royaltyPct,
      totalEmployees: (adminUsername && adminPassword) ? 1 : 0,
      licenseKey: newLicense.licenseKey,
      licenseStatus: newLicense.status,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List all franchises
hqRouter.get("/franchises", async (req: Request, res: Response): Promise<void> => {
  try {
    const franchises = await db.franchise.findMany({
      where: { isDeleted: false }
    });
    const mapped = await Promise.all(franchises.map(async (f) => {
      const totalEmployees = await db.employee.count({
        where: { franchiseId: f.id, isDeleted: false }
      });
      const admin = await db.employee.findFirst({
        where: { franchiseId: f.id, role: "FRANCHISE_ADMIN", isDeleted: false },
        select: { username: true }
      });
      return {
        ...f,
        startDate: f.since ? new Date(f.since).toISOString().split('T')[0] : "",
        royalty: f.royaltyPct,
        totalEmployees,
        adminUsername: admin?.username || null
      };
    }));
    res.json(mapped);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update a franchise
hqRouter.put("/franchises/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const {
      name, city, owner, phone, since, startDate, royaltyPct, royalty, status,
      businessName, gstNumber, email, address, state, pinCode, licenseStatus,
      adminPassword
    } = req.body;
    const adminUsername: string | undefined = req.body.adminUsername ? String(req.body.adminUsername).trim().toLowerCase() : undefined;

    if (adminUsername) {
      const existingUsername = await db.employee.findFirst({
        where: { username: adminUsername, franchiseId: { not: id } }
      });
      if (existingUsername) {
        if (existingUsername.isDeleted) {
          // Free up the username from the deleted account
          await db.employee.update({
            where: { id: existingUsername.id },
            data: { username: `del_${existingUsername.id}_${existingUsername.username}` }
          });
        } else {
          res.status(400).json({ error: "Username is already taken by another employee/admin" });
          return;
        }
      }
    }

    const dateVal = since || startDate;
    const updated = await db.$transaction(async (tx) => {
      const franchise = await tx.franchise.update({
        where: { id },
        data: {
          name,
          city,
          owner,
          phone,
          since: dateVal ? new Date(dateVal) : undefined,
          royaltyPct: (royaltyPct !== undefined || royalty !== undefined) ? Number(royaltyPct !== undefined ? royaltyPct : royalty) : undefined,
          status,
          businessName,
          gstNumber,
          email,
          address,
          state,
          pinCode,
          licenseStatus
        }
      });

      if (adminUsername || adminPassword) {
        const existingAdmin = await tx.employee.findFirst({
          where: { franchiseId: id, role: "FRANCHISE_ADMIN", isDeleted: false }
        });

        if (existingAdmin) {
          const adminUpdate: { username?: string; password?: string } = {};
          if (adminUsername) adminUpdate.username = adminUsername;
          if (adminPassword) adminUpdate.password = await bcrypt.hash(adminPassword, 10);
          await tx.employee.update({ where: { id: existingAdmin.id }, data: adminUpdate });
        } else if (adminUsername && adminPassword) {
          const hashedPassword = await bcrypt.hash(adminPassword, 10);
          const userId = `USR${Date.now().toString(36).toUpperCase()}`;
          await tx.employee.create({
            data: {
              id: userId,
              name: adminUsername,
              username: adminUsername,
              password: hashedPassword,
              role: "FRANCHISE_ADMIN",
              franchiseId: id
            }
          });
        }
      }

      return franchise;
    });

    const totalEmployees = await db.employee.count({
      where: { franchiseId: id, isDeleted: false }
    });
    const admin = await db.employee.findFirst({
      where: { franchiseId: id, role: "FRANCHISE_ADMIN", isDeleted: false },
      select: { username: true }
    });

    res.json({
      ...updated,
      startDate: updated.since ? new Date(updated.since).toISOString().split('T')[0] : "",
      royalty: updated.royaltyPct,
      totalEmployees,
      adminUsername: admin?.username || null
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete (deactivate) a franchise
hqRouter.delete("/franchises/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const existing = await db.franchise.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Franchise not found" });
      return;
    }

    // Phase 0.3 — confirmed vulnerability fix. This previously ran a real
    // db.franchise.delete() (hard delete), bypassing the isDeleted/deletedAt
    // columns the model already defines and risking FK errors or silent
    // loss of the franchise record for any franchise with dependent
    // customers/jobs/invoices/employees. Every other protected-record
    // delete in this codebase is soft; this now matches that policy and
    // preserves all historical data belonging to the franchise.
    const franchise = await db.franchise.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), status: "Inactive" },
    });

    await logAudit({
      module: "FRANCHISE",
      recordId: id,
      action: "DELETE",
      userId: req.user?.id || "unknown",
      branchId: id,
      oldValue: existing,
      newValue: franchise,
      ipAddress: req.ip,
      device: req.headers["user-agent"] ? String(req.headers["user-agent"]) : null,
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GLOBAL USER MANAGEMENT (HQ Only)
// ═══════════════════════════════════════════════════════════════

// Create a Franchise Admin for a specific franchise.
// Item #6 (Phase 1B Step 3) — this used to call db.employee.create() directly,
// which skipped every guard the normal employee-creation path enforces:
// license-limit checks and, critically, the Phase 0.1 rule that only an
// existing SUPER_ADMIN may assign the SUPER_ADMIN role. An HQ_USER could
// therefore create a SUPER_ADMIN account through this endpoint even though
// every other creation path blocks it. Delegating to the canonical
// EmployeeService.createEmployee closes that gap by construction — one
// implementation of "create an employee," not two.
hqRouter.post("/users", async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, role, franchiseId, name } = req.body;

    if (!username || !password || !role) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const authReq = req as AuthRequest;
    const employeeService = new EmployeeService();
    const newUser = await employeeService.createEmployee(
      { name: name || username, username, password, role, franchiseId: franchiseId || null },
      authReq.user?.role || "UNKNOWN",
      authReq.user?.franchiseId ?? undefined
    );

    res.json(newUser);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Get HQ global dashboard stats
// REP-01C (D-REP1/D-REP2/D-REP3) — classified COMPATIBILITY: existing
// response contract (totalFranchises/globalRevenue/businessSummary/
// salesSummary/inventorySummary/employeeSummary) preserved unchanged, but
// every metric that overlaps with the canonical getHQSummary() aggregation
// now comes from ReportService's shared methods instead of a second,
// independent Prisma computation. Fields with no canonical equivalent yet
// (completedJobCards, pendingQualityChecks, pendingOutpasses,
// nearExpiryProducts, jobsAssigned/jobsCompleted, franchiseRevenue's
// string-formatted shape) remain local — not invented, just not
// consolidated because nothing else calculates them yet.
hqRouter.get("/dashboard", requireAction('reports:hq-summary:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const reportService = new ReportService();
    const [revenueSummary, employeeSummary, inventorySummary] = await Promise.all([
      reportService.getRevenueSummary(),
      reportService.getEmployeeSummary(),
      reportService.getInventorySummary(),
    ]);

    // Business Summary queries — no canonical equivalent yet for these
    // exact fields (completedJobCards/pendingQualityChecks/pendingOutpasses
    // combine statuses no shared method currently groups this way).
    const totalFranchises = await db.franchise.count({ where: { isDeleted: false } });
    const activeFranchises = await db.franchise.count({ where: { status: "Active", isDeleted: false } });
    const totalCustomers = await db.customer.count({ where: { isDeleted: false } });
    const totalVehiclesServiced = await db.job.count({ where: { status: "Delivered", isDeleted: false } });
    const activeJobCards = await db.job.count({ where: { status: { in: ["Pending", "In Progress", "In_Progress"] }, isDeleted: false } });
    const completedJobCards = await db.job.count({ where: { status: { in: ["Completed", "QC Passed", "Ready For Billing", "Delivered"] }, isDeleted: false } });
    const pendingQualityChecks = await db.job.count({ where: { status: "Work Completed", isDeleted: false } });
    const pendingOutpasses = await db.outPass.count({ where: { status: "Pending", isDeleted: false } });

    // Employee Summary's job-related fields — no canonical equivalent yet.
    const jobsAssigned = await db.job.count({ where: { status: { in: ["Pending", "In Progress"] }, isDeleted: false } });
    const jobsCompleted = await db.job.count({ where: { status: "Completed", isDeleted: false } });

    // leadsReceived/leadsConverted kept local, NOT consolidated into
    // getLeadSummary(): leadsReceived is a genuine unconditional total
    // (every lead regardless of status) which the 4-bucket shared summary
    // doesn't provide, and this route's own leadsConverted definition
    // (status === "Converted" only) is narrower than getLeadSummary()'s
    // (status IN ['Converted','Won','Closed']) — not confirmed to be the
    // same metric, so not merged, per the same conservative rule already
    // applied to workshop.service.ts's pendingQualityChecks.
    const leadsReceived = await db.lead.count({ where: { isDeleted: false } });
    const leadsConverted = await db.lead.count({ where: { status: "Converted", isDeleted: false } });

    const franchises = await db.franchise.findMany({ where: { isDeleted: false } });
    const franchiseRevenue = franchises.map(f => ({
      location: f.city,
      jobs: `${f.jobs} jobs`,
      revenue: `₹${f.revenue.toLocaleString("en-IN")}`
    }));

    res.json({
      totalFranchises,
      globalRevenue: revenueSummary.monthlyRevenue,
      totalJobs: completedJobCards,
      franchiseRevenue,
      globalLowStock: inventorySummary.lowStock,
      businessSummary: {
        totalFranchises,
        activeFranchises,
        totalCustomers,
        totalVehiclesServiced,
        activeJobCards,
        completedJobCards,
        pendingQualityChecks,
        pendingOutpasses,
      },
      salesSummary: {
        leadsReceived,
        leadsConverted,
        revenueToday: revenueSummary.todayRevenue,
        revenueThisMonth: revenueSummary.monthlyRevenue,
        outstandingPayments: revenueSummary.outstandingPayments,
      },
      inventorySummary: {
        pendingStockRequests: inventorySummary.pendingStockRequests,
        pendingDispatches: inventorySummary.pendingDispatches,
        lowStockAlerts: inventorySummary.lowStock,
        nearExpiryProducts: 0, // unchanged — no expiry/batch tracking exists (INV-03, deferred)
      },
      employeeSummary: {
        totalEmployees: employeeSummary.totalEmployees,
        presentToday: employeeSummary.presentToday,
        absentToday: employeeSummary.absentToday,
        jobsAssigned,
        jobsCompleted,
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List all audit logs
hqRouter.get("/audit-logs", async (req: Request, res: Response): Promise<void> => {
  try {
    const { search, module, action, branchId } = req.query;

    const conditions: any = {};
    if (module) conditions.module = String(module);
    if (action) conditions.action = String(action);
    if (branchId) conditions.branchId = String(branchId);

    if (search) {
      conditions.OR = [
        { recordId: { contains: String(search), mode: "insensitive" } },
        { userId: { contains: String(search), mode: "insensitive" } },
        { action: { contains: String(search), mode: "insensitive" } },
        { module: { contains: String(search), mode: "insensitive" } },
      ];
    }

    const logs = await db.auditLog.findMany({
      where: conditions,
      orderBy: { createdAt: "desc" },
    });
    res.json(logs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new license key
hqRouter.post("/licenses", async (req: Request, res: Response): Promise<void> => {
  try {
    const { organizationId, licenseKey, maxSuperAdmins, maxHQUsers, maxFranchiseAdmins, maxFranchiseUsers, expiryDate, features } = req.body;
    const license = await db.license.create({
      data: {
        organizationId: organizationId || "GLOBAL",
        licenseKey,
        maxSuperAdmins: Number(maxSuperAdmins || 1),
        maxHQUsers: Number(maxHQUsers || 6),
        maxFranchiseAdmins: Number(maxFranchiseAdmins || 1),
        maxFranchiseUsers: Number(maxFranchiseUsers || 6),
        expiryDate: new Date(expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
        features: features || [],
      }
    });
    res.json(license);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// List all licenses
hqRouter.get("/licenses", async (req: Request, res: Response): Promise<void> => {
  try {
    const licenses = await db.license.findMany();
    res.json(licenses);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Activate a license key for a franchise
hqRouter.post("/licenses/activate", async (req: Request, res: Response): Promise<void> => {
  try {
    const { licenseKey, franchiseId } = req.body;
    const license = await db.license.findUnique({ where: { licenseKey } });
    if (!license) {
      res.status(404).json({ error: "License key not found" });
      return;
    }
    if (license.expiryDate && new Date(license.expiryDate).getTime() < Date.now()) {
      res.status(400).json({ error: "License key has expired" });
      return;
    }
    const updated = await db.license.update({
      where: { licenseKey },
      data: {
        organizationId: franchiseId,
        activatedAt: new Date(),
        activatedBy: (req as any).user?.id || "unknown",
        status: "Active"
      }
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GLOBAL SERVICE MASTER (HQ Only)
// ═══════════════════════════════════════════════════════════════

hqRouter.post("/services/master", async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, name, category, standardPrice, estimatedTime, warranty, status, allowPriceEdit } = req.body;
    const service = await db.serviceMaster.create({
      data: {
        code,
        name,
        category,
        standardPrice: Number(standardPrice),
        estimatedTime,
        warranty,
        status: status || "Active",
        allowPriceEdit: allowPriceEdit !== undefined ? Boolean(allowPriceEdit) : false
      }
    });
    res.json(service);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

hqRouter.get("/services/master", async (req: Request, res: Response): Promise<void> => {
  try {
    const list = await db.serviceMaster.findMany();
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

hqRouter.put("/services/master/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const { name, category, standardPrice, estimatedTime, warranty, status, allowPriceEdit } = req.body;
    const updated = await db.serviceMaster.update({
      where: { id },
      data: {
        name,
        category,
        standardPrice: standardPrice !== undefined ? Number(standardPrice) : undefined,
        estimatedTime,
        warranty,
        status,
        allowPriceEdit: allowPriceEdit !== undefined ? Boolean(allowPriceEdit) : undefined
      }
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Item #3 (Phase 1B Step 3) — ServiceMaster has no isDeleted field, so this
// remains a genuine hard delete for now (a proper soft-delete migration is a
// separate, later schema phase). Interim containment: SUPER_ADMIN only, a
// mandatory reason, and a full pre-delete snapshot written to the audit log
// in the same transaction as the delete — if either half fails, neither
// happens, so the audit trail can never claim a deletion that didn't occur.
hqRouter.delete("/services/master/:id", requireRole("SUPER_ADMIN"), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) {
      res.status(400).json({ error: "A reason is required to permanently delete a Service Master entry." });
      return;
    }

    const authReq = req as AuthRequest;
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.serviceMaster.findUnique({ where: { id } });
      if (!existing) {
        throw new Error("Service Master entry not found");
      }

      await tx.auditLog.create({
        data: {
          module: "SERVICE_MASTER",
          recordId: id,
          action: "PERMANENT_DELETE",
          userId: authReq.user?.id || "unknown",
          oldValue: JSON.parse(JSON.stringify(existing)),
          newValue: { reason },
          ipAddress: req.ip,
          device: req.headers["user-agent"] ? String(req.headers["user-agent"]) : null,
        },
      });

      return tx.serviceMaster.delete({ where: { id } });
    });

    res.json({ success: true, deleted: result });
  } catch (error: any) {
    res.status(error.message === "Service Master entry not found" ? 404 : 500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PRICING MASTERS (HQ Only)
// ═══════════════════════════════════════════════════════════════

hqRouter.post("/pricing/master", async (req: Request, res: Response): Promise<void> => {
  try {
    const { itemType, code, name, price, franchiseId, status } = req.body;
    const record = await db.priceMaster.create({
      data: {
        itemType,
        code,
        name,
        price: Number(price),
        franchiseId: franchiseId || null,
        status: status || "Active"
      }
    });
    res.json(record);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

hqRouter.get("/pricing/master", async (req: Request, res: Response): Promise<void> => {
  try {
    const { franchiseId } = req.query;
    const conditions: any = {};
    if (franchiseId) {
      conditions.OR = [
        { franchiseId: String(franchiseId) },
        { franchiseId: null }
      ];
    }
    const list = await db.priceMaster.findMany({ where: conditions });
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// RECORD RESTORE & DELETED RECORDS (HQ Only)
// ═══════════════════════════════════════════════════════════════

hqRouter.get("/deleted-records", async (req: Request, res: Response): Promise<void> => {
  try {
    const customers = await db.customer.findMany({ where: { isDeleted: true } });
    const jobs = await db.job.findMany({ where: { isDeleted: true } });
    const employees = await db.employee.findMany({ where: { isDeleted: true } });
    const inventory = await db.inventory.findMany({ where: { isDeleted: true } });
    const invoices = await db.invoice.findMany({ where: { isDeleted: true } });
    const payments = await db.payment.findMany({ where: { isDeleted: true } });

    res.json({
      customers,
      jobs,
      employees,
      inventory,
      invoices,
      payments
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

hqRouter.post("/deleted-records/:model/:id/restore", async (req: Request, res: Response): Promise<void> => {
  try {
    const model = String(req.params.model || "");
    const id = String(req.params.id || "");
    let result = null;

    const updateData: any = { isDeleted: false, deletedAt: null };

    if (model === "customers") result = await db.customer.update({ where: { id }, data: updateData });
    else if (model === "jobs") result = await db.job.update({ where: { id }, data: updateData });
    else if (model === "employees") result = await db.employee.update({ where: { id }, data: updateData });
    else if (model === "inventory") result = await db.inventory.update({ where: { id }, data: updateData });
    else if (model === "invoices") result = await db.invoice.update({ where: { id }, data: updateData });
    else if (model === "payments") result = await db.payment.update({ where: { id }, data: updateData });
    else {
      res.status(400).json({ error: "Invalid model name" });
      return;
    }

    const userId = (req as any).user?.id || "unknown";
    await logAudit({
      module: model.toUpperCase(),
      recordId: id,
      action: "RESTORE",
      userId,
      branchId: null,
      oldValue: { isDeleted: true },
      newValue: result,
      ipAddress: req.ip,
      device: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
    });

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Item #2 (Phase 1B Step 3) — this generic route used to hard-delete any of
// six models with zero per-model precondition, which for `employees` bypassed
// the SUPER_ADMIN-immutability guard entirely (it called db.employee.delete
// directly, never consulting employee.service.ts's checks), and for `invoices`
// provided a second, laxer path around Item #1's dedicated purge policy.
// Locked policy: SUPER_ADMIN only; invoices delegate to the one canonical
// invoice-purge service (never a second implementation); payments/customers/
// jobs/inventory are blocked entirely (payments have no legitimate hard-delete
// path at all, the other three are pending their own safety-precondition design);
// employees are blocked from ever targeting a SUPER_ADMIN account.
// RBAC-02 — grant-management foundation. SUPER_ADMIN only (deliberately
// narrower than this router's default SUPER_ADMIN/HQ_USER gate — this
// manages the grants every other role, HQ_USER included, is checked
// against). Validates the role against the known-role roster and every
// action against the RBAC-01 catalog before writing anything; touches only
// RolePermission.actions, never the legacy .permissions field. Atomic grant
// write + audit event via RoleActionGrantService.
hqRouter.put(
  "/role-permissions/:role/actions",
  requireRole("SUPER_ADMIN"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const role = String(req.params.role || "");
      const parsed = setRoleActionsSchema.safeParse({ body: req.body });
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join('; ') });
        return;
      }
      const updated = await new RoleActionGrantService().setRoleActions(role, parsed.data.body.actions, req.user);
      res.json(updated);
    } catch (error: any) {
      const status = error.statusCode || 500;
      res.status(status).json({ error: error.message });
    }
  }
);

hqRouter.delete("/deleted-records/:model/:id/permanent", requireRole("SUPER_ADMIN"), async (req: Request, res: Response): Promise<void> => {
  try {
    const model = String(req.params.model || "");
    const id = String(req.params.id || "");
    const authReq = req as AuthRequest;

    if (model === "invoices") {
      const billingService = new BillingService();
      const deleted = await billingService.deleteInvoice(id, req.body?.reason, authReq.user);
      res.json({ success: true, deleted });
      return;
    }

    if (model === "payments") {
      res.status(400).json({ error: "Payments have no permanent-delete path. Use the existing payment soft-delete instead." });
      return;
    }

    if (model === "customers" || model === "jobs" || model === "inventory") {
      res.status(400).json({ error: `Permanent deletion of ${model} is not yet enabled pending a dedicated safety policy for this model.` });
      return;
    }

    if (model !== "employees") {
      res.status(400).json({ error: "Invalid model name" });
      return;
    }

    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) {
      res.status(400).json({ error: "A reason is required to permanently delete an employee record." });
      return;
    }

    const result = await db.$transaction(async (tx) => {
      const existing = await tx.employee.findUnique({ where: { id } });
      if (!existing) {
        throw new Error("Employee not found");
      }
      if (existing.role === "SUPER_ADMIN") {
        throw new Error("A Super Administrator account can never be permanently deleted.");
      }

      await tx.auditLog.create({
        data: {
          module: "EMPLOYEES",
          recordId: id,
          action: "PERMANENT_DELETE",
          userId: authReq.user?.id || "unknown",
          branchId: existing.franchiseId,
          oldValue: JSON.parse(JSON.stringify(existing)),
          newValue: { reason },
          ipAddress: req.ip,
          device: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
        },
      });

      return tx.employee.delete({ where: { id } });
    });

    const { password: _pw, ...deletedWithoutPassword } = result;
    res.json({ success: true, deleted: deletedWithoutPassword });
  } catch (error: any) {
    const status = error.statusCode || (/not found/i.test(error.message) ? 404 : /Super Administrator/i.test(error.message) ? 403 : 500);
    res.status(status).json({ error: error.message });
  }
});

// Financial GST & Accounting CSV Export
hqRouter.get("/reports/financial/export", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type, franchiseId, startDate, endDate } = req.query;

    if (type === "gst") {
      // GST-10 — this used to re-derive CGST/SGST directly from Invoice with
      // its own flat-half fallback, a second GST calculation living outside
      // GstTransaction. It now delegates to the gstr1 CSV export (per-invoice
      // / rate-HSN detail, matching this endpoint's original filing-grade
      // granularity) built on the same ledger, so there is exactly one GST
      // CSV implementation, not two. The coarser monthly aggregate remains
      // separately available at /api/reports/billing/export?type=gst-summary.
      const reportService = new ReportService();
      const { csv, filename } = await reportService.exportBillingCsv(
        "gstr1",
        franchiseId ? String(franchiseId) : undefined,
        startDate ? String(startDate) : undefined,
        endDate ? String(endDate) : undefined
      );

      // Phase G — this route previously produced no audit event at all,
      // unlike the modular /api/reports/billing/export path (which calls
      // ReportController.auditExport for every export). Same event shape,
      // so both GST CSV export paths are equally auditable.
      if (req.user) {
        await logAudit({
          module: "Reports Export",
          recordId: "NONE",
          action: "EXPORT",
          userId: req.user.username || req.user.name || req.user.id || "unknown",
          branchId: req.user.franchiseId || null,
          ipAddress: req.ip || String(req.headers["x-forwarded-for"] || ""),
          device: req.headers["user-agent"] || "Unknown Device",
          newValue: { reportName: "gstr1", queryParams: { type, franchiseId, startDate, endDate } },
        });
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.send(csv);
      return;
    }

    const conditions: any = { isDeleted: false };
    if (franchiseId) conditions.franchiseId = String(franchiseId);
    if (startDate || endDate) {
      conditions.date = {};
      if (startDate) conditions.date.gte = new Date(String(startDate));
      if (endDate) conditions.date.lte = new Date(String(endDate));
    }

    const invoices = await db.invoice.findMany({
      where: conditions,
      include: { franchise: true },
      orderBy: { date: "desc" }
    });

    let csv = "Txn Number,Date,Type,Particulars,Debit (R),Credit (R),Franchise\n";
    for (const inv of invoices) {
      const total = inv.amount + inv.gst - inv.discount;
      csv += `"${inv.id}","${new Date(inv.date).toISOString().slice(0, 10)}","Sales Invoice","${inv.client}",${total},0,"${inv.franchise?.name || 'HQ'}"\n`;
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=accounting_ledger.csv");
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// FRANCHISE ACTIVATION REQUESTS (Ikasle/Super Admin Approval)
// ═══════════════════════════════════════════════════════════════

// List pending franchise requests (unified: both old Approval-table requests and new Pending franchises)
hqRouter.get("/franchise-requests", async (req: Request, res: Response): Promise<void> => {
  try {
    // Old approval-table based requests (legacy)
    const approvalList = await db.approval.findMany({
      where: { module: "FRANCHISE", status: "Pending" },
      orderBy: { createdAt: "desc" }
    });

    // New flow: pending Franchise records with their linked licenses
    const pendingFranchises = await db.franchise.findMany({
      where: { status: "Pending", isDeleted: false },
      orderBy: { since: "desc" }
    });

    const franchiseRequests = await Promise.all(pendingFranchises.map(async (f) => {
      const license = await db.license.findFirst({
        where: { organizationId: f.id }
      });
      return {
        _type: "franchise",
        id: f.id,
        franchiseId: f.id,
        module: "FRANCHISE",
        status: "Pending",
        createdAt: f.since,
        requesterName: f.owner || f.name,
        payload: {
          name: f.name,
          city: f.city,
          owner: f.owner,
          phone: f.phone,
          email: f.email,
          address: f.address,
          state: f.state,
          pinCode: f.pinCode,
          gstNumber: f.gstNumber,
          businessName: f.businessName,
          royaltyPct: f.royaltyPct,
          licenseKey: license?.licenseKey || null,
          licenseExpiry: license?.expiryDate || null,
          licenseFeatures: license?.features || [],
        }
      };
    }));

    // Return unified list with old approvals first, then new-style franchise requests
    res.json([...approvalList, ...franchiseRequests]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});



// Franchise Performance Monitoring Stats (§3.7 — distinct from §16.4's
// Franchise Dashboard: this is HQ inspecting ANY specific franchise by id,
// with string-formatted display fields and a recent-activity feed, not a
// self-service operational dashboard).
// REP-01C (D-REP1/D-REP4) — classified SPECIALIZED: genuinely different
// purpose/shape from the canonical Franchise Dashboard (§16.4), so its
// response contract is preserved, but lowStockItems/presentToday now come
// from the shared getInventorySummary()/getEmployeeSummary() instead of
// independent queries. revenue/pendingPayments/customerCount/vehicleCount/
// activeLeads/jobCards/dailyActivitySummary have no canonical equivalent
// (different filters — e.g. vehicleCount here is "Delivered" jobs only,
// revenue includes Cancelled invoices unlike the canonical revenue
// summary) and stay local rather than risk silently changing this
// established monitoring view's numbers.
hqRouter.get("/franchises/:id/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const reportService = new ReportService();
    const [inventorySummary, employeeSummary] = await Promise.all([
      reportService.getInventorySummary(id),
      reportService.getEmployeeSummary(id),
    ]);

    const customerCount = await db.customer.count({ where: { franchiseId: id, isDeleted: false } });
    const vehicleCount = await db.job.count({ where: { franchiseId: id, status: "Delivered", isDeleted: false } });
    const activeLeads = await db.lead.count({ where: { franchiseId: id, status: { not: "Converted" }, isDeleted: false } });
    const jobCards = await db.job.count({ where: { franchiseId: id, isDeleted: false } });

    const invoices = await db.invoice.findMany({ where: { franchiseId: id, isDeleted: false } });
    const revenue = invoices.reduce((sum, inv) => sum + (inv.amount + inv.gst - inv.discount), 0);

    let pendingPayments = 0;
    for (const inv of invoices) {
      if (inv.status === "Cancelled") continue;
      const payments = await db.payment.findMany({ where: { invoiceId: inv.id, isDeleted: false } });
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      const totalAmount = inv.amount + inv.gst - inv.discount;
      if (totalPaid < totalAmount) {
        pendingPayments += (totalAmount - totalPaid);
      }
    }

    const dailyActivity = await db.auditLog.findMany({
      where: { branchId: id },
      orderBy: { createdAt: "desc" },
      take: 10
    });

    res.json({
      customerCount,
      vehicleCount,
      activeLeads,
      jobCards,
      revenue,
      pendingPayments,
      inventoryStatus: inventorySummary.lowStock > 0 ? `${inventorySummary.lowStock} low stock items` : "All Good",
      employeeAttendance: `${employeeSummary.presentToday} present today`,
      dailyActivitySummary: dailyActivity.map(log => `${log.userId} performed ${log.action} on ${log.module}`),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Employee Performance Reporting Stats
// REP-01C (D-REP1/D-REP2) — COMPATIBILITY adapter: the calculation logic
// that used to live here directly is now the canonical
// ReportService.getEmployeePerformanceReport (added §16.8), reused
// verbatim (identical dateLimit/timeframe rules, identical per-employee
// field shape) so this route's existing response contract is unchanged.
hqRouter.get("/reports/employees/performance", requireAction('reports:employee:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { timeframe, franchiseId } = req.query;
    const reportService = new ReportService();
    const report = await reportService.getEmployeePerformanceReport(
      franchiseId ? String(franchiseId) : undefined,
      timeframe ? String(timeframe) : undefined
    );
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


// Consolidated and Franchise-Wise Master Reports Overview
hqRouter.get("/reports/overview", async (req: Request, res: Response): Promise<void> => {
  try {
    const { franchiseId, startDate, endDate } = req.query;

    const conditions: any = { isDeleted: false };
    if (franchiseId) conditions.franchiseId = String(franchiseId);
    if (startDate || endDate) {
      conditions.date = {};
      if (startDate) conditions.date.gte = new Date(String(startDate));
      if (endDate) conditions.date.lte = new Date(String(endDate));
    }

    const invoices = await db.invoice.findMany({
      where: conditions
    });

    const totalSalesAmount = invoices.reduce((sum, i) => sum + i.amount, 0);
    const totalTaxAmount = invoices.reduce((sum, i) => sum + i.gst, 0);
    const totalDiscountAmount = invoices.reduce((sum, i) => sum + i.discount, 0);
    const totalInvoiceValue = totalSalesAmount + totalTaxAmount - totalDiscountAmount;

    const paymentConditions: any = { isDeleted: false };
    if (franchiseId) paymentConditions.franchiseId = String(franchiseId);
    if (startDate || endDate) {
      paymentConditions.date = {};
      if (startDate) paymentConditions.date.gte = new Date(String(startDate));
      if (endDate) paymentConditions.date.lte = new Date(String(endDate));
    }

    const payments = await db.payment.findMany({ where: paymentConditions });
    const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
    const outstanding = totalInvoiceValue > totalCollected ? (totalInvoiceValue - totalCollected) : 0;

    const leadConditions: any = { isDeleted: false };
    if (franchiseId) leadConditions.franchiseId = String(franchiseId);
    if (startDate || endDate) {
      leadConditions.date = {};
      if (startDate) leadConditions.date.gte = new Date(String(startDate));
      if (endDate) leadConditions.date.lte = new Date(String(endDate));
    }
    const leads = await db.lead.findMany({ where: leadConditions });
    const totalLeads = leads.length;
    const convertedLeads = leads.filter(l => l.status === "Converted").length;
    const leadConversionRate = totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(2)) : 0;

    const invConditions: any = { isDeleted: false };
    if (franchiseId) invConditions.franchiseId = String(franchiseId);
    const inventory = await db.inventory.findMany({ where: invConditions });
    const inventoryItemsCount = inventory.length;
    const inventoryTotalValuation = inventory.reduce((sum, item) => sum + (item.stock * item.cost), 0);

    const franchises = await db.franchise.findMany({ where: { isDeleted: false } });
    const franchiseBreakdown = [];

    for (const fran of franchises) {
      const franInvoices = await db.invoice.findMany({ where: { franchiseId: fran.id, isDeleted: false } });
      const franSales = franInvoices.reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);
      const royaltyDue = Number((franSales * (fran.royaltyPct / 100)).toFixed(2));
      const jobsCount = await db.job.count({ where: { franchiseId: fran.id, isDeleted: false } });

      franchiseBreakdown.push({
        franchiseId: fran.id,
        name: fran.name,
        city: fran.city,
        sales: franSales,
        royaltyDue,
        jobsCount,
        status: fran.status
      });
    }

    res.json({
      sales: {
        totalSalesAmount,
        totalTaxAmount,
        totalDiscountAmount,
        totalInvoiceValue
      },
      revenue: {
        totalCollected,
        outstanding
      },
      leads: {
        totalLeads,
        convertedLeads,
        leadConversionRate
      },
      inventory: {
        itemsCount: inventoryItemsCount,
        totalValuation: inventoryTotalValuation
      },
      franchiseBreakdown
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// VENDOR MASTER & PURCHASE MANAGEMENT (§Vendor & Purchase Management)
// ═══════════════════════════════════════════════════════════════

// GET /api/hq/vendors - List all active vendors
// Purchase GST/ITC foundation — previously had no role gate at all; any
// authenticated user, any role, could read HQ's entire vendor register.
// Purchases/vendors are architecturally HQ-global (no franchiseId to scope
// by), so the correct fix is the same HQ-only gate every purchase write
// route already uses, not a new franchise-scope mechanism.
hqRouter.get("/vendors", requireRole("SUPER_ADMIN", "HQ_USER"), async (req: Request, res: Response): Promise<void> => {
  try {
    const vendors = await db.vendor.findMany({
      where: { isDeleted: false },
      orderBy: { name: "asc" }
    });
    res.json(vendors);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/hq/vendors - Create a new vendor (HQ only)
hqRouter.post("/vendors", requireRole("SUPER_ADMIN", "HQ_USER"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Purchase GST/ITC foundation — `state` already existed on the schema
    // (GST-08) but was never accepted here, so it was permanently null for
    // every vendor created through this endpoint.
    const { code, name, gstNumber, contact, phone, email, address, state, status } = req.body;
    if (!code || !name) {
      res.status(400).json({ error: "Vendor code and name are required." });
      return;
    }
    const existing = await db.vendor.findUnique({ where: { code } });
    if (existing && !existing.isDeleted) {
      res.status(400).json({ error: "Vendor with this code already exists." });
      return;
    }
    const vendor = await db.vendor.create({
      data: {
        code,
        name,
        gstNumber: gstNumber || "",
        contact: contact || "",
        phone: phone || "",
        email: email || "",
        address: address || "",
        state: state || null,
        status: status || "Active",
      }
    });

    await logAudit({
      module: "Vendor",
      recordId: vendor.id,
      action: "CREATE",
      userId: req.user?.id || "unknown",
      branchId: null,
      oldValue: null,
      newValue: vendor,
    });

    res.status(201).json(vendor);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/hq/vendors/:id - Update an existing vendor (HQ only)
hqRouter.put("/vendors/:id", requireRole("SUPER_ADMIN", "HQ_USER"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const existing = await db.vendor.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Vendor not found." });
      return;
    }
    const { modifiedBy, createdBy, id: bodyId, createdAt, updatedAt, purchases, ...updateData } = req.body;
    const updated = await db.vendor.update({
      where: { id },
      data: updateData
    });

    await logAudit({
      module: "Vendor",
      recordId: id,
      action: "UPDATE",
      userId: req.user?.id || "unknown",
      branchId: null,
      oldValue: existing,
      newValue: updated,
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/hq/vendors/:id - Soft-delete a vendor (PRD rule: Purchase records shall not be permanently deleted)
hqRouter.delete("/vendors/:id", requireRole("SUPER_ADMIN", "HQ_USER"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const existing = await db.vendor.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Vendor not found." });
      return;
    }
    const deleted = await db.vendor.update({
      where: { id },
      data: { isDeleted: true, status: "Inactive", deletedAt: new Date().toISOString() }
    });

    await logAudit({
      module: "Vendor",
      recordId: id,
      action: "DELETE",
      userId: req.user?.id || "unknown",
      branchId: null,
      oldValue: existing,
      newValue: deleted,
    });

    res.json(deleted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ── Purchase Orders ──────────────────────────────────────────────────────────

// GET /api/hq/purchases - List purchase orders (with vendor info)
// Purchase GST/ITC foundation — same auth gap as GET /vendors: previously
// reachable by any authenticated user regardless of role.
hqRouter.get("/purchases", requireRole("SUPER_ADMIN", "HQ_USER"), async (req: Request, res: Response): Promise<void> => {
  try {
    const status = req.query.status as string | undefined;
    const where: any = { isDeleted: false };
    if (status && typeof status === "string") {
      where.stage = status;
    }
    const orders = await db.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { vendor: true }
    });
    const formatted = orders.map((o: any) => ({
      ...o,
      vendorName: o.vendor ? o.vendor.name : "Unknown Vendor",
      vendorCode: o.vendor ? o.vendor.code : ""
    }));
    res.json(formatted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/hq/purchases - Create a new Purchase Order (PRD rule: Only HQ shall create Purchase Orders)
hqRouter.post("/purchases", requireRole("SUPER_ADMIN", "HQ_USER"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { orderNumber, vendorId, items, totalAmount, notes, createdBy } = req.body;
    if (!orderNumber || !vendorId) {
      res.status(400).json({ error: "orderNumber and vendorId are required." });
      return;
    }
    const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) {
      res.status(404).json({ error: "Vendor not found." });
      return;
    }
    const itemsString = typeof items === "string" ? items : JSON.stringify(items || []);
    const order = await db.purchaseOrder.create({
      data: {
        orderNumber,
        vendorId,
        vendorName: vendor.name,
        items: itemsString,
        totalAmount: Number(totalAmount) || 0,
        paidAmount: 0,
        stage: "ORDERED",
        notes: notes || "",
        createdBy: createdBy || "HQ User",
      }
    });

    await logAudit({
      module: "Purchase",
      recordId: order.id,
      action: "CREATE",
      userId: req.user?.id || "unknown",
      branchId: null,
      oldValue: null,
      newValue: order,
    });

    res.status(201).json(order);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/hq/purchases/:id/receive - Goods Receipt & auto-update HQ inventory (PRD rule: Purchase shall automatically update HQ inventory)
hqRouter.post("/purchases/:id/receive", requireRole("SUPER_ADMIN", "HQ_USER"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const order = await db.purchaseOrder.findUnique({ where: { id } });
    if (!order || order.isDeleted) {
      res.status(404).json({ error: "Purchase Order not found." });
      return;
    }
    if (order.stage === "RECEIVED" || order.stage === "INVOICED" || order.stage === "PAID") {
      res.status(400).json({ error: "Goods receipt has already been processed for this purchase order." });
      return;
    }

    let parsedItems: Array<{ name: string; sku?: string; qty: number; unitPrice?: number }> = [];
    try {
      parsedItems = JSON.parse(order.items);
    } catch {
      parsedItems = [];
    }

    const performedBy = req.user?.id || "unknown";

    // INV-02 — this whole receipt (every item's stock/movement write, plus
    // the PO's own stage transition) now runs as one transaction. It used
    // to be a sequence of unwrapped calls: a failure partway through could
    // leave some items updated with no movement record, or stock applied
    // with the PO never reaching RECEIVED. Actor is now the authenticated
    // caller (was a hardcoded "HQ Procurement" string), and new HQ items
    // use the same canonical generateUid("ITM") every other creation path
    // uses (was an ad hoc INV-<timestamp>-<random> id).
    const updated = await db.$transaction(async (tx) => {
      for (const item of parsedItems) {
        const qty = Number(item.qty) || 0;
        if (qty <= 0) continue;

        const existingItem = await tx.inventory.findFirst({
          where: {
            name: item.name,
            isDeleted: false,
            franchiseId: null // HQ inventory
          }
        });

        let inventoryId = "";
        let newStock = qty;
        if (existingItem) {
          inventoryId = existingItem.id;
          newStock = existingItem.stock + qty;
          await tx.inventory.update({
            where: { id: existingItem.id },
            data: {
              stock: newStock,
              cost: item.unitPrice ? Number(item.unitPrice) : existingItem.cost
            }
          });
        } else {
          inventoryId = generateUid("ITM");
          newStock = qty;
          await tx.inventory.create({
            data: {
              id: inventoryId,
              name: item.name,
              category: "Purchase Goods",
              stock: qty,
              unit: "Pcs",
              reorder: 5,
              cost: item.unitPrice ? Number(item.unitPrice) : 0,
              supplier: "HQ Supplier",
              location: "HQ Warehouse",
              franchiseId: null
            }
          });
        }

        await tx.inventoryMovement.create({
          data: {
            itemId: inventoryId,
            type: "PURCHASE_RECEIPT",
            quantity: qty,
            balance: newStock,
            reference: order.orderNumber,
            performedBy,
            franchiseId: null,
          }
        });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          stage: "RECEIVED",
          receivedAt: new Date().toISOString()
        }
      });
    });

    await logAudit({
      module: "Purchase",
      recordId: id,
      action: "RECEIVE",
      userId: req.user?.id || "unknown",
      branchId: null,
      oldValue: order,
      newValue: updated,
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT & POST /api/hq/purchases/:id/invoice - Attach purchase invoice
// Purchase GST/ITC foundation — previously wrote only invoiceNumber + stage.
// Now resolves and persists the purchase's GST snapshot, PurchaseOrderLine
// rows, and PURCHASE GstTransaction ledger rows, all atomically, via
// GstPurchaseInvoiceService (mirrors the sales/CN/DN architecture exactly —
// no second GST engine or ledger).
const attachPurchaseInvoiceHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const parsed = attachPurchaseInvoiceSchema.safeParse({ body: req.body });
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join('; ') });
      return;
    }
    const updated = await new GstPurchaseInvoiceService().attachInvoice(id, parsed.data.body, req.user);
    res.json(updated);
  } catch (error: any) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message });
  }
};

hqRouter.put("/purchases/:id/invoice", requireRole("SUPER_ADMIN", "HQ_USER"), attachPurchaseInvoiceHandler);
hqRouter.post("/purchases/:id/invoice", requireRole("SUPER_ADMIN", "HQ_USER"), attachPurchaseInvoiceHandler);

// POST /api/hq/purchases/:id/pay - Record Supplier Payment
hqRouter.post("/purchases/:id/pay", requireRole("SUPER_ADMIN", "HQ_USER"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const existing = await db.purchaseOrder.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      res.status(404).json({ error: "Purchase Order not found." });
      return;
    }
    const paidAmount = Number(req.body.paidAmount) || 0;
    if (!isValidPaymentAmount(paidAmount, existing.totalAmount)) {
      res.status(400).json({ error: `paidAmount must be between 0 and the purchase total (${existing.totalAmount}).` });
      return;
    }
    const updated = await db.purchaseOrder.update({
      where: { id },
      data: {
        paidAmount,
        stage: "PAID",
        paidAt: new Date().toISOString()
      }
    });

    await logAudit({
      module: "Purchase",
      recordId: id,
      action: "PAY",
      userId: req.user?.id || "unknown",
      branchId: null,
      oldValue: existing,
      newValue: updated,
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/hq/purchases/:id - Soft-delete purchase order (PRD rule: Purchase records shall not be permanently deleted)
hqRouter.delete("/purchases/:id", requireRole("SUPER_ADMIN", "HQ_USER"), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const existing = await db.purchaseOrder.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Purchase Order not found." });
      return;
    }
    const deleted = await db.purchaseOrder.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date().toISOString()
      }
    });

    await logAudit({
      module: "Purchase",
      recordId: id,
      action: "DELETE",
      userId: req.user?.id || "unknown",
      branchId: null,
      oldValue: existing,
      newValue: deleted,
    });

    res.json(deleted);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/hq/purchases/:id - Edit / Update purchase order
hqRouter.put("/purchases/:id", requireRole("SUPER_ADMIN", "HQ_USER"), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { orderNumber, vendorId, items, totalAmount, notes } = req.body;

    const existing = await db.purchaseOrder.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Purchase Order not found." });
      return;
    }

    const updateData: any = {};
    if (orderNumber) updateData.orderNumber = orderNumber;
    if (notes !== undefined) updateData.notes = notes;
    if (totalAmount !== undefined) updateData.totalAmount = Number(totalAmount) || 0;
    if (items) updateData.items = typeof items === "string" ? items : JSON.stringify(items);

    if (vendorId) {
      const vendor = await db.vendor.findUnique({ where: { id: vendorId } });
      if (vendor) {
        updateData.vendorId = vendorId;
        updateData.vendorName = vendor.name;
      }
    }

    const updated = await db.purchaseOrder.update({
      where: { id },
      data: updateData
    });
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// MASTERS & CONFIGURATION (HQ Only) — §Masters
// Supports all category types via a single MasterData model.
// ═══════════════════════════════════════════════════════════════

const VALID_MASTER_CATEGORIES = [
  // Customer Masters
  "CUSTOMER_TYPE", "LEAD_SOURCE", "REFERRAL_TYPE",
  // Vehicle Masters
  "VEHICLE_BRAND", "VEHICLE_MODEL", "FUEL_TYPE", "COLOUR",
  // Employee Masters
  "DEPARTMENT", "DESIGNATION", "ROLE",
  // Inventory Masters
  "PRODUCT_CATEGORY", "UNIT_OF_MEASURE", "BRAND",
  // Finance Masters
  "GST_RATE", "PAYMENT_MODE", "DISCOUNT_TYPE",
  // System Masters
  "NOTIFICATION_TEMPLATE", "NUMBER_SERIES", "BUSINESS_HOURS", "HOLIDAY_CALENDAR",
];

async function resequenceCategory(category: string, parentId: string | null = null) {
  try {
    const list = await db.masterData.findMany({
      where: {
        category: category.toUpperCase(),
        parentId: parentId || null,
        isDeleted: false,
      },
      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" },
        { createdAt: "asc" },
        { id: "asc" },
      ],
    });

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      if (!item) continue;
      const targetOrder = i + 1;
      if (item.sortOrder !== targetOrder) {
        await db.masterData.update({
          where: { id: item.id },
          data: { sortOrder: targetOrder },
        });
      }
    }
  } catch (err) {
    console.error(`Failed to resequence category ${category}:`, err);
  }
}

// One-time startup resequencing to repair any historical sequence gaps
setTimeout(async () => {
  try {
    const categories = await db.masterData.groupBy({
      by: ["category"],
      where: { isDeleted: false },
    });
    for (const row of categories) {
      const parents = await db.masterData.findMany({
        where: { category: row.category, isDeleted: false },
        select: { parentId: true },
        distinct: ["parentId"],
      });
      for (const p of parents) {
        await resequenceCategory(row.category, p.parentId);
      }
    }
  } catch (err) {
    console.error("Startup resequencing failed:", err);
  }
}, 3000);

// GET /api/hq/masters?category=VEHICLE_BRAND  — list all entries for a category
hqRouter.get("/masters", async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, parentId, status } = req.query;

    const where: any = { isDeleted: false };
    if (category) where.category = String(category).toUpperCase();
    if (parentId) where.parentId = String(parentId);
    if (status) where.status = String(status);

    const list = await db.masterData.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/hq/masters/categories  — list all distinct categories
hqRouter.get("/masters/categories", async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db.masterData.groupBy({
      by: ["category"],
      where: { isDeleted: false },
      orderBy: { category: "asc" },
    });
    const categories = rows.map((r) => r.category);
    // Also include the full valid list so the UI can show empty categories
    const merged = Array.from(new Set([...VALID_MASTER_CATEGORIES, ...categories])).sort();
    res.json(merged);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/hq/masters/:id  — get single entry
hqRouter.get("/masters/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const record = await db.masterData.findFirst({ where: { id, isDeleted: false } });
    if (!record) { res.status(404).json({ error: "Master record not found" }); return; }
    res.json(record);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/hq/masters  — create a new master entry
hqRouter.post("/masters", async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, code, name, value, parentId, sortOrder, status } = req.body;
    const actor = (req as AuthRequest).user;

    if (!category || !name) {
      res.status(400).json({ error: "category and name are required." });
      return;
    }

    const cat = String(category).toUpperCase();
    if (!VALID_MASTER_CATEGORIES.includes(cat)) {
      res.status(400).json({ error: `Invalid category '${cat}'. Allowed: ${VALID_MASTER_CATEGORIES.join(", ")}` });
      return;
    }

    // Prevent duplicate name within same category
    const duplicate = await db.masterData.findFirst({
      where: { category: cat, name: String(name).trim(), isDeleted: false },
    });
    if (duplicate) {
      res.status(409).json({ error: `A '${cat}' entry with this name already exists.` });
      return;
    }

    const record = await db.masterData.create({
      data: {
        category: cat,
        code: code ? String(code).trim().toUpperCase() : null,
        name: String(name).trim(),
        value: value ? String(value).trim() : null,
        parentId: parentId ? String(parentId) : null,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
        status: status || "Active",
        createdBy: actor?.id || "system",
      },
    });

    await resequenceCategory(cat, parentId);

    const finalRecord = await db.masterData.findUnique({ where: { id: record.id } }) || record;

    await logAudit({
      module: "masters",
      recordId: finalRecord.id,
      action: "create",
      userId: actor?.id || "system",
      branchId: null,
      newValue: finalRecord,
    });

    res.status(201).json(finalRecord);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/hq/masters/:id  — update a master entry
hqRouter.put("/masters/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = (req as AuthRequest).user;
    const { code, name, value, parentId, sortOrder, status } = req.body;

    const existing = await db.masterData.findFirst({ where: { id, isDeleted: false } });
    if (!existing) { res.status(404).json({ error: "Master record not found" }); return; }

    const updateData: any = {};
    if (name !== undefined) updateData.name = String(name).trim();
    if (code !== undefined) updateData.code = code ? String(code).trim().toUpperCase() : null;
    if (value !== undefined) updateData.value = value ? String(value).trim() : null;
    if (parentId !== undefined) updateData.parentId = parentId ? String(parentId) : null;
    if (sortOrder !== undefined) updateData.sortOrder = Number(sortOrder);
    if (status !== undefined) updateData.status = status;

    const updated = await db.masterData.update({ where: { id }, data: updateData });

    // Resequence the category and parentId of the record
    await resequenceCategory(existing.category, existing.parentId);
    const newParentId = parentId !== undefined ? parentId : existing.parentId;
    if (newParentId !== existing.parentId) {
      await resequenceCategory(existing.category, newParentId);
    }

    const finalRecord = await db.masterData.findUnique({ where: { id } }) || updated;

    await logAudit({
      module: "masters",
      recordId: id,
      action: "update",
      userId: actor?.id || "system",
      branchId: null,
      oldValue: existing,
      newValue: finalRecord,
    });

    res.json(finalRecord);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/hq/masters/:id  — soft-delete a master entry
// PRD Rule: Historical transactions are not affected by master data changes.
hqRouter.delete("/masters/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const actor = (req as AuthRequest).user;

    const existing = await db.masterData.findFirst({ where: { id, isDeleted: false } });
    if (!existing) { res.status(404).json({ error: "Master record not found" }); return; }

    // Soft-delete — historical transactions retain the name/value at time of creation.
    const deleted = await db.masterData.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), status: "Inactive" },
    });

    await resequenceCategory(existing.category, existing.parentId);

    await logAudit({
      module: "masters",
      recordId: id,
      action: "delete",
      userId: actor?.id || "system",
      branchId: null,
      oldValue: existing,
    });

    res.json({ success: true, id: deleted.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/hq/masters/seed  — seed default master data for a fresh installation
hqRouter.post("/masters/seed", async (req: Request, res: Response): Promise<void> => {
  try {
    const actor = (req as AuthRequest).user;

    const defaults: Array<{ category: string; name: string; value?: string; sortOrder?: number }> = [
      // Customer Masters
      { category: "CUSTOMER_TYPE", name: "Individual", sortOrder: 1 },
      { category: "CUSTOMER_TYPE", name: "Corporate", sortOrder: 2 },
      { category: "CUSTOMER_TYPE", name: "Fleet", sortOrder: 3 },
      { category: "LEAD_SOURCE", name: "Walk-In", sortOrder: 1 },
      { category: "LEAD_SOURCE", name: "WhatsApp", sortOrder: 2 },
      { category: "LEAD_SOURCE", name: "Social Media", sortOrder: 3 },
      { category: "LEAD_SOURCE", name: "Referral", sortOrder: 4 },
      { category: "LEAD_SOURCE", name: "Website", sortOrder: 5 },
      { category: "REFERRAL_TYPE", name: "Customer Referral", sortOrder: 1 },
      { category: "REFERRAL_TYPE", name: "Employee Referral", sortOrder: 2 },
      { category: "REFERRAL_TYPE", name: "Partner Referral", sortOrder: 3 },
      // Vehicle Masters
      { category: "VEHICLE_BRAND", name: "Maruti Suzuki", sortOrder: 1 },
      { category: "VEHICLE_BRAND", name: "Hyundai", sortOrder: 2 },
      { category: "VEHICLE_BRAND", name: "Tata", sortOrder: 3 },
      { category: "VEHICLE_BRAND", name: "Mahindra", sortOrder: 4 },
      { category: "VEHICLE_BRAND", name: "Honda", sortOrder: 5 },
      { category: "VEHICLE_BRAND", name: "Toyota", sortOrder: 6 },
      { category: "VEHICLE_BRAND", name: "Ford", sortOrder: 7 },
      { category: "VEHICLE_BRAND", name: "Kia", sortOrder: 8 },
      { category: "VEHICLE_BRAND", name: "MG", sortOrder: 9 },
      { category: "FUEL_TYPE", name: "Petrol", sortOrder: 1 },
      { category: "FUEL_TYPE", name: "Diesel", sortOrder: 2 },
      { category: "FUEL_TYPE", name: "CNG", sortOrder: 3 },
      { category: "FUEL_TYPE", name: "Electric (EV)", sortOrder: 4 },
      { category: "FUEL_TYPE", name: "Hybrid", sortOrder: 5 },
      { category: "COLOUR", name: "White", sortOrder: 1 },
      { category: "COLOUR", name: "Black", sortOrder: 2 },
      { category: "COLOUR", name: "Silver", sortOrder: 3 },
      { category: "COLOUR", name: "Red", sortOrder: 4 },
      { category: "COLOUR", name: "Blue", sortOrder: 5 },
      { category: "COLOUR", name: "Grey", sortOrder: 6 },
      { category: "COLOUR", name: "Brown", sortOrder: 7 },
      // Employee Masters
      { category: "DEPARTMENT", name: "Workshop", sortOrder: 1 },
      { category: "DEPARTMENT", name: "Sales & CRM", sortOrder: 2 },
      { category: "DEPARTMENT", name: "Finance", sortOrder: 3 },
      { category: "DEPARTMENT", name: "Human Resources", sortOrder: 4 },
      { category: "DEPARTMENT", name: "Inventory & Procurement", sortOrder: 5 },
      { category: "DEPARTMENT", name: "Management", sortOrder: 6 },
      { category: "DESIGNATION", name: "Technician", sortOrder: 1 },
      { category: "DESIGNATION", name: "Senior Technician", sortOrder: 2 },
      { category: "DESIGNATION", name: "Service Advisor", sortOrder: 3 },
      { category: "DESIGNATION", name: "Workshop Manager", sortOrder: 4 },
      { category: "DESIGNATION", name: "Store Manager", sortOrder: 5 },
      { category: "DESIGNATION", name: "Accountant", sortOrder: 6 },
      { category: "DESIGNATION", name: "Franchise Admin", sortOrder: 7 },
      { category: "DESIGNATION", name: "HQ Manager", sortOrder: 8 },
      // Inventory Masters
      { category: "PRODUCT_CATEGORY", name: "Lubricants & Oils", sortOrder: 1 },
      { category: "PRODUCT_CATEGORY", name: "Tyres & Batteries", sortOrder: 2 },
      { category: "PRODUCT_CATEGORY", name: "Spare Parts", sortOrder: 3 },
      { category: "PRODUCT_CATEGORY", name: "Accessories", sortOrder: 4 },
      { category: "PRODUCT_CATEGORY", name: "Consumables", sortOrder: 5 },
      { category: "UNIT_OF_MEASURE", name: "Litre (L)", sortOrder: 1 },
      { category: "UNIT_OF_MEASURE", name: "Millilitre (mL)", sortOrder: 2 },
      { category: "UNIT_OF_MEASURE", name: "Kilogram (kg)", sortOrder: 3 },
      { category: "UNIT_OF_MEASURE", name: "Gram (g)", sortOrder: 4 },
      { category: "UNIT_OF_MEASURE", name: "Piece (Pcs)", sortOrder: 5 },
      { category: "UNIT_OF_MEASURE", name: "Set", sortOrder: 6 },
      { category: "UNIT_OF_MEASURE", name: "Pair", sortOrder: 7 },
      // Finance Masters
      { category: "GST_RATE", name: "0% GST", value: "0", sortOrder: 1 },
      { category: "GST_RATE", name: "5% GST", value: "5", sortOrder: 2 },
      { category: "GST_RATE", name: "12% GST", value: "12", sortOrder: 3 },
      { category: "GST_RATE", name: "18% GST", value: "18", sortOrder: 4 },
      { category: "GST_RATE", name: "28% GST", value: "28", sortOrder: 5 },
      { category: "PAYMENT_MODE", name: "Cash", sortOrder: 1 },
      { category: "PAYMENT_MODE", name: "UPI", sortOrder: 2 },
      { category: "PAYMENT_MODE", name: "Debit Card", sortOrder: 3 },
      { category: "PAYMENT_MODE", name: "Credit Card", sortOrder: 4 },
      { category: "PAYMENT_MODE", name: "Bank Transfer (NEFT/RTGS)", sortOrder: 5 },
      { category: "PAYMENT_MODE", name: "Cheque", sortOrder: 6 },
      { category: "DISCOUNT_TYPE", name: "Percentage Discount", sortOrder: 1 },
      { category: "DISCOUNT_TYPE", name: "Flat Amount Discount", sortOrder: 2 },
      { category: "DISCOUNT_TYPE", name: "Loyalty Discount", sortOrder: 3 },
      { category: "DISCOUNT_TYPE", name: "Seasonal Offer", sortOrder: 4 },
      // System Masters
      { category: "BUSINESS_HOURS", name: "Monday–Saturday: 09:00–20:00", value: '{"Mon":{"open":"09:00","close":"20:00"},"Tue":{"open":"09:00","close":"20:00"},"Wed":{"open":"09:00","close":"20:00"},"Thu":{"open":"09:00","close":"20:00"},"Fri":{"open":"09:00","close":"20:00"},"Sat":{"open":"09:00","close":"20:00"},"Sun":null}', sortOrder: 1 },
    ];

    let created = 0;
    let skipped = 0;

    for (const item of defaults) {
      const existing = await db.masterData.findFirst({
        where: { category: item.category, name: item.name, isDeleted: false },
      });
      if (!existing) {
        await db.masterData.create({
          data: {
            ...item,
            status: "Active",
            createdBy: actor?.id || "system",
          },
        });
        created++;
      } else {
        skipped++;
      }
    }

    // Resequence all categories that were seeded
    const categoriesToResequence = Array.from(new Set(defaults.map((d) => d.category)));
    for (const cat of categoriesToResequence) {
      await resequenceCategory(cat);
    }

    res.json({ success: true, created, skipped, total: defaults.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});










