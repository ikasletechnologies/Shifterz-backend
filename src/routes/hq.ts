import { Router, type Request, type Response } from "express";
import { db } from "../lib/db.js";
import { authenticate as requireAuth, requireRole, type AuthRequest } from "../middleware/auth.middleware.js";
import bcrypt from "bcrypt";
import { logAudit } from "../shared/services/audit.service.js";

export const hqRouter = Router();

// Secure all routes in this router to SUPER_ADMIN or HQ_USER
hqRouter.use(requireAuth);
hqRouter.use(requireRole("SUPER_ADMIN", "HQ_USER"));

// ═══════════════════════════════════════════════════════════════
// FRANCHISE MANAGEMENT (HQ Only)
// ═══════════════════════════════════════════════════════════════

// Create a new franchise
hqRouter.post("/franchises", async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      name, city, owner, phone, since, royaltyPct, status, adminUsername, adminPassword,
      businessName, gstNumber, email, address, state, pinCode, licenseStatus 
    } = req.body;
    
    if (adminUsername) {
      const existing = await db.employee.findFirst({
        where: { username: adminUsername }
      });
      if (existing) {
        res.status(400).json({ error: "Username is already taken by another employee/admin" });
        return;
      }
    }

    // Generate a unique ID (e.g. FRA001)
    const count = await db.franchise.count();
    const id = `FRA${String(count + 1).padStart(3, "0")}`;

    const newFranchise = await db.$transaction(async (tx) => {
      const franchise = await tx.franchise.create({
        data: {
          id,
          name,
          city,
          owner,
          phone,
          since: since || new Date().toISOString().split('T')[0],
          revenue: 0,
          jobs: 0,
          royaltyPct: Number(royaltyPct) || 10.0,
          status: status || "Active",
          businessName,
          gstNumber,
          email,
          address,
          state,
          pinCode,
          licenseStatus: licenseStatus || "Active"
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

      return franchise;
    });

    res.json(newFranchise);
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
    res.json(franchises);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a franchise
hqRouter.delete("/franchises/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    await db.franchise.delete({
      where: { id }
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// GLOBAL USER MANAGEMENT (HQ Only)
// ═══════════════════════════════════════════════════════════════

// Create a Franchise Admin for a specific franchise
hqRouter.post("/users", async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, role, franchiseId } = req.body;
    
    if (!username || !password || !role) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = `USR${Date.now().toString(36).toUpperCase()}`;

    const newUser = await db.employee.create({
      data: {
        id: userId,
        username,
        name: username, // Employee requires name
        password: hashedPassword,
        role,
        franchiseId: franchiseId || null,
      }
    });

    // Exclude password from response
    const { password: _, ...userWithoutPassword } = newUser;
    res.json(userWithoutPassword);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get HQ global dashboard stats
hqRouter.get("/dashboard", async (req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Business Summary queries
    const totalFranchises = await db.franchise.count({ where: { isDeleted: false } });
    const activeFranchises = await db.franchise.count({ where: { status: "Active", isDeleted: false } });
    const totalCustomers = await db.customer.count({ where: { isDeleted: false } });
    const totalVehiclesServiced = await db.job.count({ where: { status: "Delivered", isDeleted: false } });
    const activeJobCards = await db.job.count({ where: { status: { in: ["Pending", "In Progress", "In_Progress"] }, isDeleted: false } });
    const completedJobCards = await db.job.count({ where: { status: { in: ["Completed", "QC Passed", "Ready For Billing", "Delivered"] }, isDeleted: false } });
    const pendingQualityChecks = await db.job.count({ where: { status: "Work Completed", isDeleted: false } });
    const pendingOutpasses = await db.outPass.count({ where: { status: "Pending", isDeleted: false } });

    // Sales Summary queries
    const leadsReceived = await db.lead.count({ where: { isDeleted: false } });
    const leadsConverted = await db.lead.count({ where: { status: "Converted", isDeleted: false } });

    const invoicesToday = await db.invoice.findMany({
      where: { date: { gte: today }, isDeleted: false }
    });
    const revenueToday = invoicesToday.reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);

    const invoicesThisMonth = await db.invoice.findMany({
      where: { date: { gte: startOfMonth }, isDeleted: false }
    });
    const revenueThisMonth = invoicesThisMonth.reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);

    const allInvoices = await db.invoice.findMany({
      where: { isDeleted: false, status: { not: "Cancelled" } }
    });
    let outstandingPayments = 0;
    for (const inv of allInvoices) {
      const payments = await db.payment.findMany({ where: { invoiceId: inv.id, isDeleted: false } });
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      const totalAmount = inv.amount + inv.gst - inv.discount;
      if (totalPaid < totalAmount) {
        outstandingPayments += (totalAmount - totalPaid);
      }
    }

    // Inventory Summary queries
    const pendingStockRequests = await db.inventoryRequest.count({ where: { status: "Pending", isDeleted: false } });
    const pendingDispatches = await db.inventoryRequest.count({ where: { status: "Approved", isDeleted: false } });

    const inventory = await db.inventory.findMany({ where: { isDeleted: false } });
    const lowStockAlerts = inventory.filter(item => item.stock <= item.reorder).length;
    const nearExpiryProducts = 0;

    // Employee Summary queries
    const totalEmployees = await db.employee.count({ where: { isDeleted: false } });
    const presentToday = await db.attendance.count({
      where: { date: { gte: today }, status: "Present", isDeleted: false }
    });
    const absentToday = await db.attendance.count({
      where: { date: { gte: today }, status: "Absent", isDeleted: false }
    });

    const jobsAssigned = await db.job.count({ where: { status: { in: ["Pending", "In Progress"] }, isDeleted: false } });
    const jobsCompleted = await db.job.count({ where: { status: "Completed", isDeleted: false } });

    const franchises = await db.franchise.findMany({ where: { isDeleted: false } });
    const franchiseRevenue = franchises.map(f => ({
      location: f.city,
      jobs: `${f.jobs} jobs`,
      revenue: `₹${f.revenue.toLocaleString("en-IN")}`
    }));

    res.json({
      totalFranchises,
      globalRevenue: revenueThisMonth,
      totalJobs: completedJobCards,
      franchiseRevenue,
      globalLowStock: lowStockAlerts,
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
        revenueToday,
        revenueThisMonth,
        outstandingPayments,
      },
      inventorySummary: {
        pendingStockRequests,
        pendingDispatches,
        lowStockAlerts,
        nearExpiryProducts,
      },
      employeeSummary: {
        totalEmployees,
        presentToday,
        absentToday,
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
        expiryDate: new Date(expiryDate || new Date(Date.now() + 365*24*60*60*1000)),
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

hqRouter.delete("/services/master/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    await db.serviceMaster.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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

hqRouter.delete("/deleted-records/:model/:id/permanent", async (req: Request, res: Response): Promise<void> => {
  try {
    const model = String(req.params.model || "");
    const id = String(req.params.id || "");
    let result = null;

    if (model === "customers") result = await db.customer.delete({ where: { id } });
    else if (model === "jobs") result = await db.job.delete({ where: { id } });
    else if (model === "employees") result = await db.employee.delete({ where: { id } });
    else if (model === "inventory") result = await db.inventory.delete({ where: { id } });
    else if (model === "invoices") result = await db.invoice.delete({ where: { id } });
    else if (model === "payments") result = await db.payment.delete({ where: { id } });
    else {
      res.status(400).json({ error: "Invalid model name" });
      return;
    }

    const userId = (req as any).user?.id || "unknown";
    await logAudit({
      module: model.toUpperCase(),
      recordId: id,
      action: "PERMANENT_DELETE",
      userId,
      branchId: null,
      oldValue: result,
      newValue: null,
      ipAddress: req.ip,
      device: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Financial GST & Accounting CSV Export
hqRouter.get("/reports/financial/export", async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, franchiseId, startDate, endDate } = req.query;

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

    if (type === "gst") {
      let csv = "Invoice Number,Date,Client,Client GSTIN,Taxable Value (R),CGST (R),SGST (R),IGST (R),Total GST (R),Discount (R),Total Amount (R),Franchise\n";
      for (const inv of invoices) {
        const taxable = inv.amount;
        const totalGst = inv.gst;
        const cgst = Number((totalGst / 2).toFixed(2));
        const sgst = Number((totalGst / 2).toFixed(2));
        const igst = 0;
        const discount = inv.discount;
        const total = taxable + totalGst - discount;
        csv += `"${inv.id}","${new Date(inv.date).toISOString().slice(0, 10)}","${inv.client}","${inv.gstNumber || 'N/A'}",${taxable},${cgst},${sgst},${igst},${totalGst},${discount},${total},"${inv.franchise?.name || 'HQ'}"\n`;
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=gst_filing_report.csv");
      res.send(csv);
      return;
    } else {
      let csv = "Txn Number,Date,Type,Particulars,Debit (R),Credit (R),Franchise\n";
      for (const inv of invoices) {
        const total = inv.amount + inv.gst - inv.discount;
        csv += `"${inv.id}","${new Date(inv.date).toISOString().slice(0, 10)}","Sales Invoice","${inv.client}",${total},0,"${inv.franchise?.name || 'HQ'}"\n`;
      }
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=accounting_ledger.csv");
      res.send(csv);
      return;
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// FRANCHISE ACTIVATION REQUESTS (Ikasle/Super Admin Approval)
// ═══════════════════════════════════════════════════════════════

// List pending franchise requests
hqRouter.get("/franchise-requests", async (req: Request, res: Response): Promise<void> => {
  try {
    const list = await db.approval.findMany({
      where: { module: "FRANCHISE", status: "Pending" },
      orderBy: { createdAt: "desc" }
    });
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Approve (Activate) a franchise request
hqRouter.post("/franchise-requests/:id/approve", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const reqUser = (req as any).user;

    const approval = await db.approval.findUnique({ where: { id } });
    if (!approval || approval.status !== "Pending") {
      res.status(404).json({ error: "Pending activation request not found." });
      return;
    }

    const payload: any = approval.payload;
    const franchiseId = "FRN-" + Math.floor(Math.random() * 9000 + 1000);

    // Create the franchise node
    const newFranchise = await db.franchise.create({
      data: {
        id: franchiseId,
        name: payload.name,
        city: payload.city || "Unknown",
        owner: payload.owner,
        phone: payload.phone,
        since: payload.since ? new Date(payload.since) : new Date(),
        revenue: 0,
        jobs: 0,
        royaltyPct: Number(payload.royaltyPct || 5),
        status: "Active",
        businessName: payload.businessName || payload.name,
        gstNumber: payload.gstNumber || null,
        email: payload.email || null,
        address: payload.address || null,
        state: payload.state || null,
        pinCode: payload.pinCode || null,
        licenseStatus: "Active",
      }
    });

    // Update approval status
    const updatedApproval = await db.approval.update({
      where: { id },
      data: {
        status: "Approved",
        approverId: reqUser?.id || "ikasle",
        approverName: reqUser?.name || "Ikasle Admin",
      }
    });

    await logAudit({
      module: "FRANCHISE",
      recordId: newFranchise.id,
      action: "ACTIVATE",
      userId: reqUser?.id || "ikasle",
      branchId: null,
      oldValue: approval,
      newValue: newFranchise,
      ipAddress: req.ip,
      device: req.headers['user-agent'] ? String(req.headers['user-agent']) : null,
    });

    res.json({ success: true, franchise: newFranchise, approval: updatedApproval });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reject a franchise request
hqRouter.post("/franchise-requests/:id/reject", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const reqUser = (req as any).user;

    const approval = await db.approval.update({
      where: { id },
      data: {
        status: "Rejected",
        approverId: reqUser?.id || "ikasle",
        approverName: reqUser?.name || "Ikasle Admin",
      }
    });

    res.json({ success: true, approval });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Franchise Performance Monitoring Stats
hqRouter.get("/franchises/:id/stats", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    const inventory = await db.inventory.findMany({ where: { franchiseId: id, isDeleted: false } });
    const lowStockItems = inventory.filter(item => item.stock <= item.reorder).length;

    const presentToday = await db.attendance.count({
      where: { franchiseId: id, date: { gte: today }, status: "Present", isDeleted: false }
    });

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
      inventoryStatus: lowStockItems > 0 ? `${lowStockItems} low stock items` : "All Good",
      employeeAttendance: `${presentToday} present today`,
      dailyActivitySummary: dailyActivity.map(log => `${log.userId} performed ${log.action} on ${log.module}`),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Employee Performance Reporting Stats
hqRouter.get("/reports/employees/performance", async (req: Request, res: Response): Promise<void> => {
  try {
    const { timeframe, franchiseId } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let dateLimit = new Date(today);
    if (timeframe === "weekly") {
      dateLimit.setDate(today.getDate() - 7);
    } else if (timeframe === "monthly") {
      dateLimit.setMonth(today.getMonth() - 1);
    } else if (timeframe === "annual") {
      dateLimit.setFullYear(today.getFullYear() - 1);
    } else {
      dateLimit = today;
    }

    const conditions: any = { isDeleted: false };
    if (franchiseId) {
      conditions.franchiseId = String(franchiseId);
    }

    const employees = await db.employee.findMany({
      where: conditions,
      include: { franchise: true }
    });

    const report = [];

    for (const emp of employees) {
      const presentCount = await db.attendance.count({
        where: { employeeId: emp.id, date: { gte: dateLimit }, status: "Present", isDeleted: false }
      });
      const absentCount = await db.attendance.count({
        where: { employeeId: emp.id, date: { gte: dateLimit }, status: "Absent", isDeleted: false }
      });

      const jobs = await db.job.findMany({
        where: {
          OR: [
            { technicianId: emp.id },
            { serviceAdvisorId: emp.id }
          ],
          createdAt: { gte: dateLimit },
          isDeleted: false
        }
      });

      const jobsAssigned = jobs.length;
      const jobsCompleted = jobs.filter(j => j.status === "Delivered" || j.status === "Completed" || j.status === "QC Passed").length;
      const jobsPending = jobs.filter(j => j.status === "Pending" || j.status === "In Progress").length;
      const reworkCount = jobs.reduce((sum, j) => sum + j.reworkCount, 0);
      const qcFails = jobs.filter(j => j.failedAt !== null).length;

      const leads = await db.lead.findMany({
        where: { assignedTo: emp.name || "", date: { gte: dateLimit }, isDeleted: false }
      });
      const leadsAssigned = leads.length;
      const leadsConverted = leads.filter(l => l.status === "Converted").length;

      const jobIds = jobs.map(j => j.id);
      const invoices = await db.invoice.findMany({
        where: {
          OR: [
            { id: { in: jobIds } },
            { client: { in: jobs.map(j => j.customer) } }
          ],
          date: { gte: dateLimit },
          isDeleted: false
        }
      });
      const revenueContribution = invoices.reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);

      report.push({
        employeeId: emp.id,
        name: emp.name,
        role: emp.role,
        franchiseName: emp.franchise?.name || "HQ",
        attendance: {
          present: presentCount,
          absent: absentCount
        },
        jobs: {
          assigned: jobsAssigned,
          completed: jobsCompleted,
          pending: jobsPending,
          qcFailures: qcFails,
          reworkCount
        },
        leads: {
          assigned: leadsAssigned,
          converted: leadsConverted,
          conversionRate: leadsAssigned > 0 ? Number(((leadsConverted / leadsAssigned) * 100).toFixed(2)) : 0
        },
        revenueContribution
      });
    }

    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// HQ Notification Endpoints
hqRouter.get("/notifications", async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id || "HQ";
    const list = await db.notification.findMany({
      where: {
        OR: [
          { userId },
          { userId: "HQ" }
        ]
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

hqRouter.post("/notifications/:id/read", async (req: Request, res: Response): Promise<void> => {
  try {
    const id = String(req.params.id);
    const updated = await db.notification.update({
      where: { id },
      data: { read: true }
    });
    res.json(updated);
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








