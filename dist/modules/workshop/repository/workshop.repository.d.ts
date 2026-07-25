export declare class WorkshopRepository {
    getAttendanceByDateAndEmployee(employeeId: string, date: string): Promise<{
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
    getJobsByTechnician(technicianId: string): Promise<{
        id: string;
        status: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        service: string;
        customer: string;
        vehicle: string;
        notes: string;
        createdAt: Date;
        technician: string;
        priority: string;
        startDate: Date;
        estCompletion: Date;
        actualCompletion: Date | null;
        photos: string[];
        technicianId: string | null;
    }[]>;
}
//# sourceMappingURL=workshop.repository.d.ts.map