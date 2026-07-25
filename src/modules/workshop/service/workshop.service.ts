import { WorkshopRepository } from '../repository/workshop.repository.js';

export class WorkshopService {
  constructor(private readonly repository: WorkshopRepository = new WorkshopRepository()) {}

  async getDashboardSummary(employeeId: string) {
    if (!employeeId) throw new Error("Employee ID is required");
    const todayStr = new Date().toISOString().split("T")[0] as string;
    
    const attendance = await this.repository.getAttendanceByDateAndEmployee(employeeId, todayStr);
    const jobs = await this.repository.getJobsByTechnician(employeeId);

    const totalAssigned = jobs.length;
    const inProgress = jobs.filter(j => j.status === "In Progress").length;
    const waitingMaterial = jobs.filter(j => j.status === "Waiting Material").length;
    const waitingCustomer = jobs.filter(j => j.status === "Waiting Customer").length;
    const waitingQC = jobs.filter(j => j.status === "Waiting QC").length;
    const completed = jobs.filter(j => j.status === "Completed").length;

    const completedToday = jobs.filter(j =>
      j.status === "Completed" &&
      j.actualCompletion instanceof Date &&
      j.actualCompletion.toISOString().startsWith(todayStr)
    ).length;

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
      performance: {
        jobsCompleted: completed,
        avgCompletionTime: "4.5 hrs",
        qcPassRate: "92%",
        reworkCount: 2
      },
      notifications: [
        { id: 1, type: "info", text: "New job assigned: TN 04 AB 1234 (PPF Full Body)", time: "10m ago" },
        { id: 2, type: "warning", text: "Priority changed to URGENT for KL 01 CD 5678", time: "1h ago" },
        { id: 3, type: "error", text: "QC Failed for TN 99 AA 9999 (Wash)", time: "2h ago" },
        { id: 4, type: "success", text: "System maintenance completed successfully.", time: "1d ago" }
      ]
    };
  }
}
