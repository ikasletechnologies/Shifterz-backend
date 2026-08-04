import { db } from '../../../lib/db.js';
import type { UpdateAttendanceDTO } from '../validation/attendance.validation.js';

function safeIsoDate(input?: string | Date | null): string {
  if (!input) return new Date().toISOString();
  if (typeof input === 'string' && !input.trim()) return new Date().toISOString();
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export class AttendanceRepository {
  async findAll(tenantFilter: any) {
    return db.attendance.findMany({
      where: tenantFilter,
      orderBy: { date: "desc" },
      include: {
        franchise: { select: { id: true, name: true, city: true } },
        employee: { select: { id: true, name: true, role: true } }
      }
    });
  }

  async findEmployeeById(id: string) {
    return db.employee.findUnique({ where: { id } });
  }

  async findExistingCheckIn(employeeId: string, date: string) {
    return db.attendance.findFirst({
      where: { employeeId, date: safeIsoDate(date), isDeleted: false }
    });
  }

  async findActiveCheckIn(employeeId: string, date: string) {
    return db.attendance.findFirst({
      where: { employeeId, date: safeIsoDate(date), isDeleted: false, clockOut: null }
    });
  }

  async createCheckIn(employeeId: string, franchiseId: string | null, date: string, clockIn: string) {
    const checkInTime = new Date(clockIn);
    const lateArrival = checkInTime.getHours() > 9 || (checkInTime.getHours() === 9 && checkInTime.getMinutes() > 30);

    return db.attendance.create({
      data: {
        employeeId,
        date: safeIsoDate(date),
        status: "Present",
        clockIn: safeIsoDate(clockIn),
        lateArrival,
        franchiseId,
      },
      include: {
        employee: { select: { id: true, name: true, role: true } }
      }
    });
  }

  async updateCheckOut(id: string, clockOut: string) {
    const existing = await db.attendance.findUnique({ where: { id } });
    if (!existing || !existing.clockIn) {
      return db.attendance.update({
        where: { id },
        data: { clockOut: safeIsoDate(clockOut) },
        include: { employee: { select: { id: true, name: true, role: true } } }
      });
    }

    const inTime = new Date(existing.clockIn);
    const outTime = new Date(clockOut);
    const diffMs = outTime.getTime() - inTime.getTime();
    const workingHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));
    const earlyDeparture = outTime.getHours() < 18;

    return db.attendance.update({
      where: { id },
      data: {
        clockOut: safeIsoDate(clockOut),
        workingHours,
        earlyDeparture
      },
      include: {
        employee: { select: { id: true, name: true, role: true } }
      }
    });
  }

  async updateAttendance(id: string, data: UpdateAttendanceDTO) {
    return db.attendance.update({
      where: { id },
      data: {
        status: data.status,
        clockIn: data.clockIn ? safeIsoDate(data.clockIn) : undefined,
        clockOut: data.clockOut ? safeIsoDate(data.clockOut) : undefined,
      },
    });
  }
}
