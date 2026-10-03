import { db } from '../../../lib/db.js';
import type { UpdateAttendanceDTO } from '../validation/attendance.validation.js';

function safeIsoDate(input?: string | Date | null): string {
  if (!input) return new Date().toISOString();
  if (typeof input === 'string' && !input.trim()) return new Date().toISOString();
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

/**
 * Returns the UTC start (00:00:00.000Z) and end (23:59:59.999Z) for a given
 * YYYY-MM-DD date string so that we match records regardless of what time the
 * `date` field was stored with (e.g. midnight UTC vs. midnight local).
 */
function dayBounds(dateStr: string): { gte: Date; lte: Date } {
  const base = dateStr.slice(0, 10); // "YYYY-MM-DD"
  return {
    gte: new Date(`${base}T00:00:00.000Z`),
    lte: new Date(`${base}T23:59:59.999Z`),
  };
}

export class AttendanceRepository {
  async findAll(tenantFilter: any) {
    return db.attendance.findMany({
      where: tenantFilter,
      orderBy: { date: 'desc' },
      include: {
        franchise: { select: { id: true, name: true, city: true } },
        employee: { select: { id: true, name: true, employeeId: true, role: true } },
      },
    });
  }

  async findEmployeeById(id: string) {
    return db.employee.findUnique({ where: { id } });
  }

  async findById(id: string) {
    return db.attendance.findFirst({ where: { id, isDeleted: false } });
  }

  /** Find any check-in record for this employee on the given calendar day. */
  async findExistingCheckIn(employeeId: string, date: string) {
    const { gte, lte } = dayBounds(date);
    return db.attendance.findFirst({
      where: { employeeId, date: { gte, lte }, isDeleted: false },
    });
  }

  /** Find a check-in that hasn't been checked out yet on the given calendar day. */
  async findActiveCheckIn(employeeId: string, date: string) {
    const { gte, lte } = dayBounds(date);
    return db.attendance.findFirst({
      where: { employeeId, date: { gte, lte }, isDeleted: false, clockOut: null },
    });
  }

  /** Find today's attendance record for the given employee (any status). */
  async findTodayRecord(employeeId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const { gte, lte } = dayBounds(today);
    return db.attendance.findFirst({
      where: { employeeId, date: { gte, lte }, isDeleted: false },
      include: { employee: { select: { id: true, name: true, employeeId: true, role: true } } },
    });
  }

  async createCheckIn(employeeId: string, franchiseId: string | null, date: string, clockIn: string) {
    const checkInTime = new Date(clockIn);
    const lateArrival = checkInTime.getUTCHours() > 4; // > 04:00 UTC = > 09:30 IST approximately

    return db.attendance.create({
      data: {
        employeeId,
        date: safeIsoDate(date),
        status: 'Present',
        clockIn: safeIsoDate(clockIn),
        lateArrival,
        franchiseId,
      },
      include: {
        employee: { select: { id: true, name: true, employeeId: true, role: true } },
      },
    });
  }

  async updateCheckOut(id: string, clockOut: string) {
    const existing = await db.attendance.findUnique({ where: { id } });
    if (!existing || !existing.clockIn) {
      return db.attendance.update({
        where: { id },
        data: { clockOut: safeIsoDate(clockOut), status: 'Checked Out' },
        include: { employee: { select: { id: true, name: true, employeeId: true, role: true } } },
      });
    }

    const inTime = new Date(existing.clockIn);
    const outTime = new Date(clockOut);
    const diffMs = outTime.getTime() - inTime.getTime();
    const workingHours = Math.max(0, Number((diffMs / (1000 * 60 * 60)).toFixed(2)));
    const earlyDeparture = outTime.getHours() < 18;

    return db.attendance.update({
      where: { id },
      data: {
        clockOut: safeIsoDate(clockOut),
        status: 'Checked Out',
        workingHours,
        earlyDeparture,
      },
      include: {
        employee: { select: { id: true, name: true, employeeId: true, role: true } },
      },
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
