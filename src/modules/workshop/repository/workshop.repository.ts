import { db } from '../../../lib/db.js';

export class WorkshopRepository {
  async getAttendanceByDateAndEmployee(employeeId: string, date: string) {
    const isoDate = new Date(date).toISOString();
    return db.attendance.findFirst({
      where: {
        employeeId,
        date: isoDate,
        isDeleted: false
      }
    });
  }

  async getJobsByTechnician(technicianId: string) {
    const employee = await db.employee.findFirst({ where: { id: technicianId } });
    const empName = employee?.name ? employee.name.trim() : "";

    const conditions: any[] = [{ technicianId }];
    if (empName) {
      conditions.push({ technician: { equals: empName, mode: "insensitive" } });
    }

    return db.job.findMany({
      where: {
        isDeleted: false,
        OR: conditions
      }
    });
  }
}
