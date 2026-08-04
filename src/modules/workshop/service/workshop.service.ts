import { WorkshopRepository } from '../repository/workshop.repository.js';
import { COMPLETED_JOB_STATUSES } from '../../../shared/constants/jobStatus.constants.js';
import { db } from '../../../lib/db.js';

export class WorkshopService {
  constructor(private readonly repository: WorkshopRepository = new WorkshopRepository()) {}

  async getDashboardSummary(employeeId: string) {
    if (!employeeId) throw new Error("Employee ID is required");
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0] as string;

    const attendance = await this.repository.getAttendanceByDateAndEmployee(employeeId, todayStr);
    const jobs = await this.repository.getJobsByTechnician(employeeId);

    const totalAssigned = jobs.length;
    const inProgress = jobs.filter(j => j.status === "In Progress").length;
    const waitingMaterial = jobs.filter(j => j.status === "Waiting Material" || j.status === "Waiting for Parts" || j.status === "Waiting Parts").length;
    const waitingCustomer = jobs.filter(j => j.status === "Waiting Customer").length;
    const waitingQC = jobs.filter(j => j.status === "Waiting QC" || j.status === "Waiting for Quality Check").length;
    const isCompleted = (s: string) => COMPLETED_JOB_STATUSES.includes(s);

    const completed = jobs.filter(j => isCompleted(j.status)).length;
    const completedToday = jobs.filter(j => {
      if (!isCompleted(j.status)) return false;
      const updatedDate = (j as any).updatedAt ? new Date((j as any).updatedAt).toISOString().split("T")[0] : null;
      const actualDate = (j as any).actualCompletion ? new Date((j as any).actualCompletion).toISOString().split("T")[0] : null;
      return !updatedDate || updatedDate === todayStr || actualDate === todayStr;
    }).length;

    // ── Real performance metrics (10.11) — replaces prior hardcoded stub ──────
    const completedJobs = jobs.filter(j => isCompleted(j.status) && j.actualCompletion);
    const avgCompletionMinutes = completedJobs.length > 0
      ? completedJobs.reduce((sum, j) => {
          const diffMs = new Date(j.actualCompletion as unknown as string).getTime() - new Date(j.startDate).getTime();
          return sum + Math.max(0, diffMs / 60000);
        }, 0) / completedJobs.length
      : 0;
    const reworkCount = jobs.filter(j => j.isRework).length;
    const qcPassed = jobs.filter(j => j.status === "QC Passed").length;
    const qcFailed = jobs.filter(j => j.status === "QC Failed").length;
    const qcTotal = qcPassed + qcFailed;
    const delayCount = jobs.filter(j => {
      const est = new Date(j.estCompletion).getTime();
      const end = j.actualCompletion ? new Date(j.actualCompletion as unknown as string).getTime() : now.getTime();
      return !isCompleted(j.status) ? now.getTime() > est : end > est;
    }).length;

    // ── Real notifications (10.4) — replaces prior hardcoded stub ─────────────
    const notifications = await db.notification.findMany({
      where: { userId: employeeId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return {
      attendance: attendance || { status: "Not Checked In", clockIn: null, clockOut: null },
      jobsSummary: {
        totalAssigned,
        inProgress,
        waitingMaterial,
        waitingCustomer,
        waitingQC,
        completedToday,
        totalCompleted: completed
      },
      // "My Jobs" (10.4) — per-job fields required by the PRD
      jobs: jobs.map(j => ({
        id: j.id,
        customer: j.customer,
        vehicle: j.vehicle,
        service: j.service,
        services: (j as any).services ?? null,
        priority: j.priority,
        estCompletion: j.estCompletion,
        status: j.status,
      })),
      performance: {
        jobsCompleted: completed,
        avgCompletionTime: avgCompletionMinutes > 0 ? `${(avgCompletionMinutes / 60).toFixed(1)} hrs` : "0.0 hrs",
        qcPassRate: qcTotal > 0 ? `${Math.round((qcPassed / qcTotal) * 100)}%` : "0%",
        reworkCount,
        delayCount,
      },
      notifications: notifications.map(n => ({
        id: n.id,
        type: n.type || "info",
        text: n.title ? `${n.title}: ${n.message}` : n.message,
        time: n.createdAt,
      })),
    };
  }

  async getFranchiseDashboard(franchiseId: string | null) {
    if (!franchiseId) throw new Error("Franchise ID is required");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Customer metrics
    const leadsToday = await db.lead.count({
      where: { franchiseId, date: { gte: today }, isDeleted: false }
    });
    const leadsTotal = await db.lead.count({ where: { franchiseId, isDeleted: false } });
    const leadsConverted = await db.lead.count({ where: { franchiseId, status: "Converted", isDeleted: false } });
    const leadConversionRate = leadsTotal > 0 ? Number(((leadsConverted / leadsTotal) * 100).toFixed(2)) : 0;

    const newCustomers = await db.customer.count({
      where: { franchiseId, createdAt: { gte: today }, isDeleted: false }
    });
    const returningCustomers = await db.customer.count({
      where: { franchiseId, visits: { gt: 1 }, isDeleted: false }
    });
    const totalCustomers = await db.customer.count({ where: { franchiseId, isDeleted: false } });
    const customerRetentionRate = totalCustomers > 0 ? Number(((returningCustomers / totalCustomers) * 100).toFixed(2)) : 0;

    // Workshop metrics
    const vehiclesReceived = await db.job.count({
      where: { franchiseId, createdAt: { gte: today }, isDeleted: false }
    });
    const vehiclesInProgress = await db.job.count({
      where: { franchiseId, status: { in: ["Pending", "In Progress", "In_Progress"] }, isDeleted: false }
    });
    const vehiclesReady = await db.job.count({
      where: { franchiseId, status: "QC Passed", isDeleted: false }
    });
    const pendingQC = await db.job.count({
      where: { franchiseId, status: "Work Completed", isDeleted: false }
    });

    const qcPassed = await db.job.count({ where: { franchiseId, passedAt: { not: null }, isDeleted: false } });
    const qcFailed = await db.job.count({ where: { franchiseId, failedAt: { not: null }, isDeleted: false } });
    const totalQC = qcPassed + qcFailed;
    const qcPassRate = totalQC > 0 ? Number(((qcPassed / totalQC) * 100).toFixed(2)) : 100;

    // Service Completion Time calculation
    const completedJobs = await db.job.findMany({
      where: { franchiseId, actualCompletion: { not: null }, isDeleted: false }
    });
    let totalCompletionMinutes = 0;
    let completedJobsCount = 0;
    for (const job of completedJobs) {
      if (job.actualCompletion) {
        const diffMs = new Date(job.actualCompletion).getTime() - new Date(job.startDate).getTime();
        totalCompletionMinutes += Math.max(0, Math.floor(diffMs / 60000));
        completedJobsCount++;
      }
    }
    const avgCompletionTimeStr = completedJobsCount > 0 
      ? (totalCompletionMinutes / completedJobsCount / 60).toFixed(1) + " hrs" 
      : "0.0 hrs";

    // Finance metrics
    const invoicesToday = await db.invoice.findMany({
      where: { franchiseId, date: { gte: today }, isDeleted: false }
    });
    const revenueToday = invoicesToday.reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);

    const invoicesThisMonth = await db.invoice.findMany({
      where: { franchiseId, date: { gte: startOfMonth }, isDeleted: false }
    });
    const revenueThisMonth = invoicesThisMonth.reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);

    const invoices = await db.invoice.findMany({
      where: { franchiseId, isDeleted: false, status: { not: "Cancelled" } }
    });
    let outstandingPayments = 0;
    let pendingInvoices = 0;

    for (const inv of invoices) {
      if (inv.status === "Pending") pendingInvoices++;
      const payments = await db.payment.findMany({ where: { invoiceId: inv.id, isDeleted: false } });
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      const totalAmount = inv.amount + inv.gst - inv.discount;
      if (totalPaid < totalAmount) {
        outstandingPayments += (totalAmount - totalPaid);
      }
    }

    // Employees metrics
    const presentToday = await db.attendance.count({
      where: { franchiseId, date: { gte: today }, status: "Present", isDeleted: false }
    });
    const absentToday = await db.attendance.count({
      where: { franchiseId, date: { gte: today }, status: "Absent", isDeleted: false }
    });
    const jobsAssigned = await db.job.count({
      where: { franchiseId, status: { in: ["Pending", "In Progress"] }, isDeleted: false }
    });
    const jobsCompleted = await db.job.count({
      where: { franchiseId, status: "Completed", isDeleted: false }
    });

    // Inventory metrics
    const inventory = await db.inventory.findMany({
      where: { franchiseId, isDeleted: false }
    });
    const availableStock = inventory.reduce((sum, i) => sum + i.stock, 0);
    const lowStockItems = inventory.filter(item => item.stock <= item.reorder).length;
    const pendingStockRequests = await db.inventoryRequest.count({
      where: { franchiseId, status: "Pending", isDeleted: false }
    });

    return {
      customer: {
        leadsToday,
        newCustomers,
        returningCustomers,
        leadConversionRate,
        customerRetentionRate
      },
      workshop: {
        vehiclesReceived,
        vehiclesInProgress,
        vehiclesReadyForDelivery: vehiclesReady,
        pendingQualityChecks: pendingQC,
        qcPassRate,
        avgCompletionTime: avgCompletionTimeStr
      },
      finance: {
        revenueToday,
        revenueThisMonth,
        outstandingPayments,
        pendingInvoices
      },
      employees: {
        presentToday,
        absentToday,
        jobsAssigned,
        jobsCompleted
      },
      inventory: {
        availableStock,
        lowStockItems,
        pendingStockRequests
      }
    };
  }
}
