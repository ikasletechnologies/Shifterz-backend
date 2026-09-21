import { WorkshopRepository } from '../repository/workshop.repository.js';
import { COMPLETED_JOB_STATUSES } from '../../../shared/constants/jobStatus.constants.js';
import { db } from '../../../lib/db.js';
import { ReportService } from '../../report/service/report.service.js';

export class WorkshopService {
  private readonly reportService = new ReportService();

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

  // REP-01C (D-REP1/D-REP3) — SPECIALIZED, retained: this view has
  // substantial unique value (customer retention rate, QC pass rate, avg
  // completion time, lead conversion) with no equivalent anywhere in the
  // canonical report layer, so it is not reduced to a thin adapter.
  // Metrics that DO overlap with the canonical shared aggregation
  // (revenue, employee attendance, inventory) now come from
  // ReportService's shared methods instead of independent queries — this
  // also fixes a real inconsistency the consolidation surfaced:
  // vehiclesInProgress here used to count status IN
  // ["Pending","In Progress","In_Progress"], a strictly broader definition
  // than the canonical getWorkshopSummary()'s ["In Progress"] only. Per
  // D-REP1 ("one authoritative implementation per metric"), this now
  // matches the canonical definition rather than keeping a second,
  // silently different one.
  async getFranchiseDashboard(franchiseId: string | null) {
    if (!franchiseId) throw new Error("Franchise ID is required");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [revenueSummary, employeeSummary, inventorySummary, workshopSummary] = await Promise.all([
      this.reportService.getRevenueSummary(franchiseId),
      this.reportService.getEmployeeSummary(franchiseId),
      this.reportService.getInventorySummary(franchiseId),
      this.reportService.getWorkshopSummary(franchiseId),
    ]);

    // Customer metrics — no canonical equivalent yet, stays local.
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

    // Workshop metrics — vehiclesReceived, QC pass rate, avg completion
    // time have no canonical equivalent yet, stay local. pendingQC here
    // deliberately stays local too, NOT consolidated into
    // getWorkshopSummary().qcPending: this uses status "Work Completed"
    // (work finished, not yet queued for QC) while the shared summary's
    // qcPending uses status "QC Pending" — these read as two different
    // pipeline stages, not confirmed to be the same metric, so
    // consolidating them would risk silently changing behavior on an
    // unverified assumption rather than genuinely fixing a duplicate.
    const vehiclesReceived = await db.job.count({
      where: { franchiseId, createdAt: { gte: today }, isDeleted: false }
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

    // Finance: pendingInvoices count has no canonical equivalent yet, stays
    // local; revenueToday/revenueThisMonth/outstandingPayments now come
    // from the shared getRevenueSummary().
    const invoices = await db.invoice.findMany({
      where: { franchiseId, isDeleted: false, status: { not: "Cancelled" } }
    });
    const pendingInvoices = invoices.filter(inv => inv.status === "Pending").length;

    // Employees: jobsAssigned/jobsCompleted have no canonical equivalent
    // yet, stay local; presentToday/absentToday now come from the shared
    // getEmployeeSummary().
    const jobsAssigned = await db.job.count({
      where: { franchiseId, status: { in: ["Pending", "In Progress"] }, isDeleted: false }
    });
    const jobsCompleted = await db.job.count({
      where: { franchiseId, status: "Completed", isDeleted: false }
    });

    // Inventory: availableStock has no canonical equivalent yet, stays
    // local; lowStockItems/pendingStockRequests now come from the shared
    // getInventorySummary().
    const inventory = await db.inventory.findMany({
      where: { franchiseId, isDeleted: false }
    });
    const availableStock = inventory.reduce((sum, i) => sum + i.stock, 0);

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
        vehiclesInProgress: workshopSummary.vehiclesInProgress,
        vehiclesReadyForDelivery: workshopSummary.readyForDelivery,
        pendingQualityChecks: pendingQC,
        qcPassRate,
        avgCompletionTime: avgCompletionTimeStr
      },
      finance: {
        revenueToday: revenueSummary.todayRevenue,
        revenueThisMonth: revenueSummary.monthlyRevenue,
        outstandingPayments: revenueSummary.outstandingPayments,
        pendingInvoices
      },
      employees: {
        presentToday: employeeSummary.presentToday,
        absentToday: employeeSummary.absentToday,
        jobsAssigned,
        jobsCompleted
      },
      inventory: {
        availableStock,
        lowStockItems: inventorySummary.lowStock,
        pendingStockRequests: inventorySummary.pendingStockRequests
      }
    };
  }
}
