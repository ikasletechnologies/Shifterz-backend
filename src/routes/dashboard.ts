import { Router, type Request, type Response } from "express";
import { db } from "../lib/db.js";
import { authenticate as requireAuth, tenant as tenantScope } from "../middleware/auth.middleware.js";

export const dashboardRouter = Router();

// Apply auth and tenant scope to all dashboard routes
dashboardRouter.use(requireAuth);
dashboardRouter.use(tenantScope);

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

    res.json({
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
    });

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
