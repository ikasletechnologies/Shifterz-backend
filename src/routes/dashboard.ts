import { Router, type Request, type Response } from "express";
import { db } from "../lib/db.js";
import { authenticate as requireAuth, tenant as tenantScope } from "../middleware/auth.middleware.js";

export const dashboardRouter = Router();

// Apply auth and tenant scope to all dashboard routes
dashboardRouter.use(requireAuth);
dashboardRouter.use(tenantScope);

// D-21 — the general dashboard previously returned every section (crm,
// workshop, financial, hr, inventory) to any authenticated user, franchise-
// scoped only, with no role differentiation at all. This maps each role to
// the dashboard "class" D-21 grants it, matching its section list as
// literally as the underlying data model allows: executive tier
// (SUPER_ADMIN/HQ_USER/FRANCHISE_ADMIN/BRANCH_MANAGER) keeps the full
// picture including revenue, per D-21's explicit text; reception-facing
// roles get customer/workshop status but not financial/HR/inventory;
// TECHNICIAN and QUALITY_INSPECTOR are limited to workshop; BILLING_EXECUTIVE
// and INVENTORY_EXECUTIVE get only their own domain. This is data
// separation on the existing endpoint, not requireAction()-based
// enforcement — RBAC-04 stays blocked until RBAC-02 is verified.
//
// Note: "RECEPTION" in D-21's text is this codebase's RECEPTION_EXECUTIVE
// (confirmed against employee.service.ts / reception.service.ts).
// Any role not listed below gets no sections — fails closed rather than
// silently exposing data to an unanticipated role.
const DASHBOARD_SECTIONS_BY_ROLE: Record<string, string[]> = {
  SUPER_ADMIN: ["crm", "workshop", "financial", "hr", "inventory"],
  HQ_USER: ["crm", "workshop", "financial", "hr", "inventory"],
  FRANCHISE_ADMIN: ["crm", "workshop", "financial", "hr", "inventory"],
  BRANCH_MANAGER: ["crm", "workshop", "financial", "hr", "inventory"],
  RECEPTION_EXECUTIVE: ["crm", "workshop"],
  SERVICE_ADVISOR: ["crm", "workshop"],
  TECHNICIAN: ["workshop"],
  QUALITY_INSPECTOR: ["workshop"],
  BILLING_EXECUTIVE: ["financial"],
  INVENTORY_EXECUTIVE: ["inventory"],
};

export function allowedDashboardSections(role?: string): string[] {
  const baseRole = (role || "").split("|")[0] || "";
  return DASHBOARD_SECTIONS_BY_ROLE[baseRole] ?? [];
}

// REP-01C (D-REP4) — endpoint C. Classified SPECIALIZED, not a
// compatibility duplicate of the canonical §16.4 Franchise Dashboard: its
// entire purpose is D-21's per-role section visibility (crm/workshop/
// financial/hr/inventory subsets, plus SERVICE_ADVISOR's own personal-
// jobs override), which the canonical dashboard does not have. Its
// individual metrics were compared field-by-field against the shared
// aggregation layer and found NOT to share the same underlying
// definition with any of them (e.g. revenueToday here counts only
// status === "Paid" invoices — collected revenue — while the canonical
// getRevenueSummary counts all non-Cancelled invoices — billed revenue;
// vehiclesInProgress here includes "Assigned" as well as "In Progress";
// pendingStockRequests here filters status "Pending", not the canonical
// "Submitted"). Per the conservative-consolidation principle, none of
// these were merged — this endpoint's existing, already-reviewed (D-21)
// behavior is left unchanged rather than silently altered on an
// unverified assumption that a same-sounding field means the same thing.
// Not gated with requireAction(): D-21's per-role section filtering
// already IS this endpoint's access-control mechanism (every
// authenticated role may call it; which sections come back is what's
// restricted) — a blanket action gate would be redundant with, not
// additive to, that existing design.
dashboardRouter.get("/", async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    // Resolved by the `tenant` middleware: {} for HQ admins (cross-franchise),
    // or { franchiseId } for a specific franchise / HQ-controlled employee (franchiseId: null).
    const tenantFilter: any = { ...((req as any).tenantFilter || {}) };

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    const todayStr = todayStart.toISOString().split("T")[0]; // For string date fields like Attendance

    // 1. CRM Metrics
    const leadsToday = await db.lead.count({ where: { ...tenantFilter, date: { gte: todayStart, lte: todayEnd } } });

    const customers = await db.customer.findMany({
      where: {
        ...tenantFilter,
        isDeleted: false
      }
    });
    const newCustomers = customers.filter(c => c.visits <= 1).length;
    const returningCustomers = customers.filter(c => c.visits > 1).length;

    // Sort by ID descending to put the most recently created customers first
    const sortedCustomers = [...customers].sort((a, b) => b.id.localeCompare(a.id));
    const newCustomersList = sortedCustomers.filter(c => c.visits <= 1).slice(0, 5);

    const appointmentsToday = await db.appointment.count({
      where: { ...tenantFilter, scheduledDate: { gte: todayStart, lte: todayEnd } }
    });

    const estimatesPending = await db.estimate.count({
      where: { ...tenantFilter, status: "Pending", isDeleted: false }
    });

    let followupsFilter: any = { ...tenantFilter, followUpDate: { gte: todayStart, lte: todayEnd } };
    if (user && user.role === "SERVICE_ADVISOR") {
      followupsFilter.performedById = user.id;
    }
    const followupsToday = await db.leadFollowUp.count({ where: followupsFilter });

    // 2. Workshop Metrics
    const carsReceivedToday = await db.carIn.count({
      where: { ...tenantFilter, inTime: { gte: todayStart, lte: todayEnd } }
    });

    const jobCardsCreated = await db.job.count({
      where: { ...tenantFilter, createdAt: { gte: todayStart, lte: todayEnd } }
    });

    const jobs = await db.job.findMany({ where: tenantFilter });
    const vehiclesInProgress = jobs.filter(j => j.status === "In Progress" || j.status === "Assigned").length;
    const vehiclesReady = jobs.filter(j => j.status === "Completed").length;
    const pendingQC = jobs.filter(j => j.status === "QC" || j.status === "Quality Check").length;

    // 3. Financial Metrics
    const invoices = await db.invoice.findMany({ where: tenantFilter });

    const revenueToday = invoices
      .filter(i => i.status === "Paid" && new Date(i.date) >= todayStart && new Date(i.date) <= todayEnd)
      .reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);

    const revenueThisMonth = invoices
      .filter(i => i.status === "Paid" && new Date(i.date) >= monthStart)
      .reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);

    const outstandingPayments = invoices
      .filter(i => i.status === "Pending" || i.status === "Overdue" || i.status === "Approved")
      .reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);

    const pendingInvoicesCount = invoices.filter(i => i.status === "Pending").length;

    // 4. HR Metrics
    const attendanceToday = await db.attendance.findMany({
      where: { ...tenantFilter, date: { gte: todayStart, lte: todayEnd } }
    });
    const presentToday = attendanceToday.filter(a => a.status === "Present").length;
    const absentToday = attendanceToday.filter(a => a.status === "Absent").length;

    let jobsAssigned = jobs.length;
    let jobsCompleted = vehiclesReady;
    if (user && user.role === "SERVICE_ADVISOR") {
      const saJobs = jobs.filter(j => j.serviceAdvisorId === user.id);
      jobsAssigned = saJobs.length;
      jobsCompleted = saJobs.filter(j => j.status === "Completed" || j.status === "Delivered" || j.status === "Out").length;
    }

    const productivity = jobsAssigned > 0 ? Math.round((jobsCompleted / jobsAssigned) * 100) : 0;

    // 5. Inventory Metrics
    const inventory = await db.inventory.findMany({ where: tenantFilter });
    const availableStock = inventory.reduce((sum, item) => sum + item.stock, 0);
    const lowStockItems = inventory.filter(item => item.stock <= item.reorder).length;

    const pendingStockRequests = await db.inventoryRequest.count({
      where: { ...tenantFilter, status: "Pending" }
    });

    // D-21 — computed the same way as before (no query/business-logic
    // change); only which sections are actually sent back is now
    // role-dependent.
    const fullDashboard: Record<string, unknown> = {
      crm: {
        appointmentsToday,
        leadsToday,
        newCustomers,
        returningCustomers,
        newCustomersList,
        estimatesPending,
        followupsToday
      },
      workshop: {
        carsReceivedToday,
        vehiclesInProgress,
        vehiclesReady,
        pendingQC,
        jobCardsCreated
      },
      financial: {
        revenueToday,
        revenueThisMonth,
        outstandingPayments,
        pendingInvoicesCount
      },
      hr: {
        presentToday,
        absentToday,
        jobsAssigned,
        jobsCompleted,
        productivity
      },
      inventory: {
        availableStock,
        lowStockItems,
        pendingStockRequests
      }
    };

    const allowedSections = allowedDashboardSections(user?.role);
    const dashboard = Object.fromEntries(
      Object.entries(fullDashboard).filter(([section]) => allowedSections.includes(section))
    );

    res.json(dashboard);

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Employee Personalized Dashboard
dashboardRouter.get("/employee{/:id}", async (req: Request, res: Response): Promise<void> => {
  try {
    const reqUser = (req as any).user;
    const targetEmployeeId = req.params.id || reqUser.id;

    // Security check: Employees can view their own dashboard.
    // Managers or HQ can view dashboards of their reporting employees.
    if (targetEmployeeId !== reqUser.id) {
      const targetEmp = await db.employee.findUnique({ where: { id: targetEmployeeId } });
      const isManager = targetEmp?.reportingManager === reqUser.name ||
        reqUser.role === "SUPER_ADMIN" ||
        reqUser.role === "HQ_USER" ||
        reqUser.role === "FRANCHISE_ADMIN";
      if (!isManager) {
        res.status(403).json({ error: "Access denied. Only reporting managers or administrators can access this employee's dashboard." });
        return;
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Attendance Status
    const attendance = await db.attendance.findFirst({
      where: { employeeId: targetEmployeeId, date: { gte: today }, isDeleted: false }
    });

    // 2. Assigned Tasks (Jobs)
    const personalJobs = await db.job.findMany({
      where: {
        OR: [
          { technicianId: targetEmployeeId },
          { serviceAdvisorId: targetEmployeeId }
        ],
        isDeleted: false
      }
    });

    const assignedTasks = personalJobs.length;
    const pendingTasks = personalJobs.filter(j => j.status === "Pending" || j.status === "In Progress").length;
    const completedTasks = personalJobs.filter(j => j.status === "Completed" || j.status === "Delivered" || j.status === "QC Passed").length;

    // 3. Notifications
    const notifications = await db.notification.findMany({
      where: { userId: targetEmployeeId, read: false },
      orderBy: { createdAt: "desc" },
      take: 5
    });

    // 4. Performance Summary
    const totalLeads = await db.lead.count({ where: { assignedTo: targetEmployeeId, isDeleted: false } });
    const convertedLeads = await db.lead.count({ where: { assignedTo: targetEmployeeId, status: "Converted", isDeleted: false } });
    const conversionRate = totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(2)) : 0;

    res.json({
      employeeId: targetEmployeeId,
      attendance: attendance ? {
        status: attendance.status,
        clockIn: attendance.clockIn,
        clockOut: attendance.clockOut,
        workingHours: attendance.workingHours,
        lateArrival: attendance.lateArrival,
        earlyDeparture: attendance.earlyDeparture
      } : { status: "Not Logged" },
      tasks: {
        assigned: assignedTasks,
        pending: pendingTasks,
        completed: completedTasks
      },
      notifications,
      performance: {
        leadsAssigned: totalLeads,
        conversionRate,
        reworkCount: personalJobs.reduce((sum, j) => sum + j.reworkCount, 0)
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
