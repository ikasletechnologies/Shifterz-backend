import { WorkshopRepository } from '../repository/workshop.repository.js';
export declare class WorkshopService {
    private readonly repository;
    constructor(repository?: WorkshopRepository);
    getDashboardSummary(employeeId: string): Promise<{
        attendance: {
            id: string;
            status: string;
            franchiseId: string | null;
            isDeleted: boolean;
            deletedAt: Date | null;
            date: Date;
            employeeId: string;
            clockIn: Date | null;
            clockOut: Date | null;
        } | {
            status: string;
            clockIn: null;
            clockOut: null;
        };
        jobsSummary: {
            totalAssigned: number;
            inProgress: number;
            waitingMaterial: number;
            waitingCustomer: number;
            waitingQC: number;
            completedToday: number;
            totalCompleted: number;
        };
        performance: {
            jobsCompleted: number;
            avgCompletionTime: string;
            qcPassRate: string;
            reworkCount: number;
        };
        notifications: {
            id: number;
            type: string;
            text: string;
            time: string;
        }[];
    }>;
}
//# sourceMappingURL=workshop.service.d.ts.map