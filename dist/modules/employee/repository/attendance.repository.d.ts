import type { UpdateAttendanceDTO } from '../validation/attendance.validation.js';
export declare class AttendanceRepository {
    findAll(tenantFilter: any): Promise<({
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
    findEmployeeById(id: string): Promise<{
        id: string;
        role: string;
        name: string;
        phone: string | null;
        status: string;
        email: string | null;
        username: string | null;
        password: string | null;
        hqControlled: boolean;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
    } | null>;
    findExistingCheckIn(employeeId: string, date: string): Promise<{
        id: string;
        status: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        date: Date;
        employeeId: string;
        clockIn: Date | null;
        clockOut: Date | null;
    } | null>;
    findActiveCheckIn(employeeId: string, date: string): Promise<{
        id: string;
        status: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        date: Date;
        employeeId: string;
        clockIn: Date | null;
        clockOut: Date | null;
    } | null>;
    createCheckIn(employeeId: string, franchiseId: string | null, date: string, clockIn: string): Promise<{
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
    updateCheckOut(id: string, clockOut: string): Promise<{
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
//# sourceMappingURL=attendance.repository.d.ts.map