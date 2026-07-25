import { AttendanceRepository } from '../repository/attendance.repository.js';
import type { CheckInDTO, CheckOutDTO, UpdateAttendanceDTO } from '../validation/attendance.validation.js';
export declare class AttendanceService {
    private readonly repository;
    constructor(repository?: AttendanceRepository);
    getAllAttendance(userRole: string, userId: string, userFranchiseId?: string): Promise<({
        employee: {
            id: string;
            role: string;
            name: string;
        };
        franchise: {
            id: string;
            name: string;
            city: string;
        } | null;
    } & {
        id: string;
        status: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        date: Date;
        employeeId: string;
        clockIn: Date | null;
        clockOut: Date | null;
    })[]>;
    checkIn(data: CheckInDTO): Promise<{
        employee: {
            id: string;
            role: string;
            name: string;
        };
    } & {
        id: string;
        status: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        date: Date;
        employeeId: string;
        clockIn: Date | null;
        clockOut: Date | null;
    }>;
    checkOut(data: CheckOutDTO): Promise<{
        employee: {
            id: string;
            role: string;
            name: string;
        };
    } & {
        id: string;
        status: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        date: Date;
        employeeId: string;
        clockIn: Date | null;
        clockOut: Date | null;
    }>;
    updateAttendance(id: string, data: UpdateAttendanceDTO): Promise<{
        id: string;
        status: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        date: Date;
        employeeId: string;
        clockIn: Date | null;
        clockOut: Date | null;
    }>;
}
//# sourceMappingURL=attendance.service.d.ts.map