import type { CreateServiceDTO, UpdateServiceDTO } from '../validation/service.validation.js';
export declare class ServiceRepository {
    findAll(): Promise<{
        id: string;
        name: string;
        isDeleted: boolean;
        deletedAt: Date | null;
        category: string;
        desc: string;
        price: number;
        duration: string;
        warranty: string;
    }[]>;
    findById(id: string): Promise<{
        id: string;
        name: string;
        isDeleted: boolean;
        deletedAt: Date | null;
        category: string;
        desc: string;
        price: number;
        duration: string;
        warranty: string;
    } | null>;
    create(id: string, data: CreateServiceDTO): Promise<{
        id: string;
        name: string;
        isDeleted: boolean;
        deletedAt: Date | null;
        category: string;
        desc: string;
        price: number;
        duration: string;
        warranty: string;
    }>;
    update(id: string, data: UpdateServiceDTO): Promise<{
        id: string;
        name: string;
        isDeleted: boolean;
        deletedAt: Date | null;
        category: string;
        desc: string;
        price: number;
        duration: string;
        warranty: string;
    }>;
    softDelete(id: string): Promise<{
        id: string;
        name: string;
        isDeleted: boolean;
        deletedAt: Date | null;
        category: string;
        desc: string;
        price: number;
        duration: string;
        warranty: string;
    }>;
}
//# sourceMappingURL=service.repository.d.ts.map