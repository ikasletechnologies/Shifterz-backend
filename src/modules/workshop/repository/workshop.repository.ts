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
    return db.job.findMany({
      where: {
        technicianId,
        isDeleted: false
      }
    });
  }
}
