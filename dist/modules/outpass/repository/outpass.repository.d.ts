import type { CreateOutpassDTO, UpdateOutpassDTO } from '../validation/outpass.validation.js';
export declare class OutpassRepository {
    findAll(): Promise<{
        id: string;
        phone: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        service: string;
        customer: string;
        vehicle: string;
        model: string;
        securityName: string;
        outTime: Date;
        technicianName: string;
        remarks: string;
        issued: boolean;
        carInId: string;
    }[]>;
    create(id: string, data: CreateOutpassDTO): Promise<{
        id: string;
        phone: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        service: string;
        customer: string;
        vehicle: string;
        model: string;
        securityName: string;
        outTime: Date;
        technicianName: string;
        remarks: string;
        issued: boolean;
        carInId: string;
    }>;
    update(id: string, data: UpdateOutpassDTO): Promise<{
        id: string;
        phone: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        service: string;
        customer: string;
        vehicle: string;
        model: string;
        securityName: string;
        outTime: Date;
        technicianName: string;
        remarks: string;
        issued: boolean;
        carInId: string;
    }>;
}
//# sourceMappingURL=outpass.repository.d.ts.map