import { ServiceRepository } from '../repository/service.repository.js';
import type { CreateServiceDTO, UpdateServiceDTO } from '../validation/service.validation.js';
export declare class ServiceService {
    private readonly repository;
    constructor(repository?: ServiceRepository);
    getAllServices(): Promise<{
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
    getServiceById(id: string): Promise<{
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
    createService(data: CreateServiceDTO): Promise<{
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
    updateService(id: string, data: UpdateServiceDTO): Promise<{
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
    deleteService(id: string): Promise<{
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
//# sourceMappingURL=service.service.d.ts.map