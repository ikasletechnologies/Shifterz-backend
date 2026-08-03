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

  const jobWhere: any = { isDeleted: false, [assigneeIdField]: { not: null } };
  if (serviceType) jobWhere.service = serviceType;
  if (dateFrom || dateTo) {
    jobWhere.startDate = {};
    if (dateFrom) jobWhere.startDate.gte = new Date(dateFrom);
    if (dateTo) jobWhere.startDate.lte = new Date(dateTo);
  }

  const jobs = await db.job.findMany({ where: jobWhere });

  const jobsByAssignee = new Map<string, typeof jobs>();
  for (const job of jobs) {
    const key = (job as any)[assigneeIdField] as string | null;
    if (!key) continue;
    if (!jobsByAssignee.has(key)) jobsByAssignee.set(key, []);
    jobsByAssignee.get(key)!.push(job);
  }

  const todayStr = new Date().toISOString().split("T")[0];

  const fullList = employees.map((emp) => {
    const empJobs = jobsByAssignee.get(emp.id) || [];
    const assignedJobs = empJobs.length;
    const inProgress = empJobs.filter((j) => j.status === "In Progress").length;
    const waitingParts = empJobs.filter((j) => j.status === "Waiting Material").length;
    const completed = empJobs.filter((j) => COMPLETED_JOB_STATUSES.includes(j.status)).length;
    const completedToday = empJobs.filter((j) => {
      if (!COMPLETED_JOB_STATUSES.includes(j.status)) return false;
      const d = j.actualCompletion ? new Date(j.actualCompletion).toISOString().split("T")[0] : null;
      return d === todayStr;
    }).length;
    const rework = empJobs.filter((j) => j.isRework).length;
    const passed = empJobs.filter((j) => j.status === "QC Passed").length;
    const failed = empJobs.filter((j) => j.status === "QC Failed").length;
    const inspected = passed + failed;
    const productivity = assignedJobs > 0 ? Math.round((completed / assignedJobs) * 100) : 0;
    const passRate = inspected > 0 ? Math.round((passed / inspected) * 100) : 0;

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
      productivity,
      inspected,
      passed,
      failed,
      passRate,
    };
  });

  const summary = {
    total: fullList.length,
    active: employees.filter((e) => e.status === "Active").length,
    inactive: employees.filter((e) => e.status !== "Active").length,
    assignedJobs: fullList.reduce((s, e) => s + e.assignedJobs, 0),
    inProgress: fullList.reduce((s, e) => s + e.inProgress, 0),
    waitingParts: fullList.reduce((s, e) => s + e.waitingParts, 0),
    completedToday: fullList.reduce((s, e) => s + e.completedToday, 0),
    rework: fullList.reduce((s, e) => s + e.rework, 0),
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
