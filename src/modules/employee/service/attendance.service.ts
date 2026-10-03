import { AttendanceRepository } from '../repository/attendance.repository.js';
import type { CheckInDTO, CheckOutDTO, UpdateAttendanceDTO } from '../validation/attendance.validation.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';

export class AttendanceService {
  constructor(private readonly repository: AttendanceRepository = new AttendanceRepository()) {}

  async getAllAttendance(userRole: string, userId: string, userFranchiseId?: string) {
    let tenantFilter: any = { isDeleted: false };
    const role = (userRole || '').toUpperCase().replace(/[\s_]+/g, '_');

    if (role === 'SUPER_ADMIN' || role === 'HQ_USER') {
      // HQ sees all records
    } else if (role === 'FRANCHISE_ADMIN' || role === 'BRANCH_MANAGER') {
      tenantFilter.franchiseId = userFranchiseId || '__NO_FRANCHISE__';
    } else {
      // Normal employees see only their own attendance
      tenantFilter.employeeId = userId;
    }

    return this.repository.findAll(tenantFilter);
  }

  /**
   * Returns today's attendance record for the authenticated user so the
   * frontend knows on page-load whether the user is already checked in or out.
   */
  async getTodayStatus(userId: string) {
    const record = await this.repository.findTodayRecord(userId);
    const isCheckedIn = !!record;
    const isCheckedOut = !!(record?.clockOut);
    return { isCheckedIn, isCheckedOut, record: record ?? null };
  }

  async checkIn(data: CheckInDTO) {
    const emp = await this.repository.findEmployeeById(data.employeeId);
    if (!emp) {
      throw new NotFoundError('Employee not found');
    }

    const date = new Date().toISOString().slice(0, 10);
    const clockIn = new Date().toISOString();

    const existing = await this.repository.findExistingCheckIn(data.employeeId, date);
    if (existing) {
      throw new ApiError(400, 'Already checked in for today');
    }

    return this.repository.createCheckIn(data.employeeId, emp.franchiseId, date, clockIn);
  }

  async checkOut(data: CheckOutDTO) {
    const date = new Date().toISOString().slice(0, 10);
    const clockOut = new Date().toISOString();

    const existing = await this.repository.findActiveCheckIn(data.employeeId, date);
    if (!existing) {
      throw new ApiError(400, 'No active check-in found for today');
    }

    return this.repository.updateCheckOut(existing.id, clockOut);
  }

  // D-14 – administrative attendance edit. SUPER_ADMIN/HQ_USER global,
  // FRANCHISE_ADMIN own franchise only, every other role blocked outright.
  async updateAttendance(id: string, data: UpdateAttendanceDTO, actor?: { role?: string; franchiseId?: string | null }) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundError('Attendance record not found');

    const role = actor?.role || '';
    if (role !== 'SUPER_ADMIN' && role !== 'HQ_USER') {
      if (role !== 'FRANCHISE_ADMIN') {
        throw new ApiError(403, 'You do not have permission to edit attendance records.');
      }
      if (existing.franchiseId !== (actor?.franchiseId ?? null)) {
        throw new ApiError(403, 'You do not have permission to edit attendance records outside your franchise.');
      }
    }

    return this.repository.updateAttendance(id, data);
  }
}
