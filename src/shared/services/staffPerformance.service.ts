import { db } from '../../lib/db.js';
import { COMPLETED_JOB_STATUSES } from '../constants/jobStatus.constants.js';

export interface StaffPerformanceParams {
  role: string;
  assigneeIdField: 'technicianId' | 'qcById' | 'serviceAdvisorId';
  tenantFilter: Record<string, any>;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  franchiseId?: string;
  serviceType?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function computeStaffPerformance(params: StaffPerformanceParams) {
  const {
    role, assigneeIdField, tenantFilter,
    search, dateFrom, dateTo, franchiseId, serviceType, status,
    page = 1, pageSize = 8,
  } = params;

  const employeeWhere: any = { ...tenantFilter, role, isDeleted: false };
  if (franchiseId !== undefined) {
    employeeWhere.franchiseId = franchiseId === "HQ" ? null : franchiseId;
  }
  if (status) employeeWhere.status = status;
  if (search) {
    employeeWhere.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
      { id: { contains: search, mode: "insensitive" } },
    ];
  }

  const employees = await db.employee.findMany({
    where: employeeWhere,
    include: { franchise: { select: { id: true, name: true } } },
    orderBy: { id: "asc" },
  });

  const jobWhere: any = { isDeleted: false };
  if (tenantFilter && tenantFilter.franchiseId) {
    jobWhere.franchiseId = tenantFilter.franchiseId;
  }
  if (franchiseId !== undefined) {
    jobWhere.franchiseId = franchiseId === "HQ" ? null : franchiseId;
  }
  if (serviceType) jobWhere.service = serviceType;
  if (dateFrom || dateTo) {
    jobWhere.startDate = {};
    if (dateFrom) jobWhere.startDate.gte = new Date(dateFrom);
    if (dateTo) jobWhere.startDate.lte = new Date(dateTo);
  }

  const jobs = await db.job.findMany({ where: jobWhere });
  const jobIds = jobs.map((j) => j.id);

  // 10.11: Revenue from Assigned Jobs / Customer Complaints — only invoices/complaints
  // linked via the (additive) Invoice.jobId / CustomerComplaint.jobId columns count here.
  const [invoices, complaints] = await Promise.all([
    jobIds.length > 0 ? db.invoice.findMany({ where: { jobId: { in: jobIds }, isDeleted: false } }) : Promise.resolve([]),
    jobIds.length > 0 ? db.customerComplaint.findMany({ where: { jobId: { in: jobIds } } }) : Promise.resolve([]),
  ]);

  const isWaitingParts = (s: string) => {
    if (!s) return false;
    const norm = s.trim().toLowerCase();
    return norm === "waiting for parts" || norm === "waiting material" || norm === "waiting parts" || (norm.includes("waiting") && norm.includes("part"));
  };

  const isCompleted = (s: string) => COMPLETED_JOB_STATUSES.includes(s);
  const isInProgress = (s: string) => s === "In Progress";
  const isQcPending = (s: string) => s === "QC Pending" || s === "Waiting QC" || s === "QC";

  const todayStr = new Date().toISOString().split("T")[0];

  const fullList = employees.map((emp) => {
    const empJobs = jobs.filter((j) => {
      const techIdMatch = Boolean(j.technicianId && j.technicianId === emp.id);
      const nameMatch = Boolean(j.technician && emp.name && j.technician.trim().toLowerCase() === emp.name.trim().toLowerCase());
      const usernameMatch = Boolean(j.technician && emp.username && j.technician.trim().toLowerCase() === emp.username.trim().toLowerCase());
      return techIdMatch || nameMatch || usernameMatch;
    });

    const assignedJobs = empJobs.length;
    const inProgress = empJobs.filter((j) => isInProgress(j.status)).length;
    const waitingParts = empJobs.filter((j) => isWaitingParts(j.status)).length;
    const completed = empJobs.filter((j) => isCompleted(j.status)).length;
    const completedToday = empJobs.filter((j) => {
      if (!isCompleted(j.status)) return false;
      const d = j.actualCompletion ? new Date(j.actualCompletion).toISOString().split("T")[0] : null;
      return d === todayStr;
    }).length;
    const rework = empJobs.filter((j) => j.isRework).length;
    // Matched via passedAt/failedAt (set by both the legacy generic status flow
    // and the dedicated QC module's decide()) rather than exact status strings,
    // since a passed job's status moves on to "Ready For Billing"/"Delivered".
    const passed = empJobs.filter((j) => j.passedAt).length;
    const failed = empJobs.filter((j) => j.failedAt && !j.passedAt).length;
    const inspected = passed + failed;
    const qcAttempts = empJobs.reduce((sum, j) => sum + (j.qcAttemptCount || 0), 0);
    const qcPending = empJobs.filter((j) => isQcPending(j.status)).length;
    const productivity = assignedJobs > 0 ? Math.round((completed / assignedJobs) * 100) : 0;
    const passRate = inspected > 0 ? Math.round((passed / inspected) * 100) : 0;

    // 10.11: additional workshop performance metrics
    const now = new Date();
    const delayCount = empJobs.filter((j) => {
      const end = j.actualCompletion ? new Date(j.actualCompletion) : now;
      return !isCompleted(j.status) ? now > new Date(j.estCompletion) : end > new Date(j.estCompletion);
    }).length;
    const empJobIds = new Set(empJobs.map((j) => j.id));
    const revenue = invoices
      .filter((inv) => inv.jobId && empJobIds.has(inv.jobId))
      .reduce((sum, inv) => sum + (inv.amount + inv.gst - inv.discount), 0);
    const customerComplaints = complaints.filter((c) => c.jobId && empJobIds.has(c.jobId)).length;

    return {
      id: emp.id,
      name: emp.name,
      phone: emp.phone,
      status: emp.status,
      branch: emp.franchise?.name || "Headquarters",
      franchiseId: emp.franchiseId,
      assignedJobs,
      inProgress,
      waitingParts,
      completed,
      completedToday,
      rework,
      qcPending,
      productivity,
      inspected,
      passed,
      failed,
      passRate,
      delayCount,
      revenue,
      customerComplaints,
      qcAttempts,
    };
  });

  const summary = {
    total: fullList.length,
    active: employees.filter((e) => e.status === "Active").length,
    inactive: employees.filter((e) => e.status !== "Active").length,
    assignedJobs: jobs.length,
    inProgress: jobs.filter((j) => isInProgress(j.status)).length,
    waitingParts: jobs.filter((j) => isWaitingParts(j.status)).length,
    completed: jobs.filter((j) => isCompleted(j.status)).length,
    totalCompleted: jobs.filter((j) => isCompleted(j.status)).length,
    completedToday: jobs.filter((j) => {
      if (!isCompleted(j.status)) return false;
      const d = j.actualCompletion ? new Date(j.actualCompletion).toISOString().split("T")[0] : null;
      return d === todayStr;
    }).length,
    rework: jobs.filter((j) => j.isRework || j.status === "Rework" || j.status === "QC Failed").length,
    qcPending: jobs.filter((j) => isQcPending(j.status)).length,
    avgProductivity: fullList.length > 0
      ? Math.round(fullList.reduce((s, e) => s + e.productivity, 0) / fullList.length)
      : 0,
    avgPassRate: fullList.length > 0
      ? Math.round(fullList.reduce((s, e) => s + e.passRate, 0) / fullList.length)
      : 0,
  };

  const list = fullList.slice((page - 1) * pageSize, page * pageSize);

  return { summary, list, total: fullList.length, page, pageSize };
}
