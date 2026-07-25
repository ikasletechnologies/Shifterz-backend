import type { CreateInventoryDTO, UpdateInventoryDTO } from '../validation/inventory.validation.js';
export declare class InventoryRepository {
    findAll(): Promise<{
        id: string;
        name: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        unit: string;
        category: string;
        stock: number;
        reorder: number;
        cost: number;
        supplier: string;
        location: string;
    }[]>;
    create(id: string, data: CreateInventoryDTO): Promise<{
        id: string;
        name: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        unit: string;
        category: string;
        stock: number;
        reorder: number;
        cost: number;
        supplier: string;
        location: string;
    }>;
    update(id: string, data: UpdateInventoryDTO): Promise<{
        id: string;
        name: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        unit: string;
        category: string;
        stock: number;
        reorder: number;
        cost: number;
        supplier: string;
        location: string;
    }>;
    softDelete(id: string): Promise<{
        id: string;
        name: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        unit: string;
        category: string;
        stock: number;
        reorder: number;
        cost: number;
        supplier: string;
        location: string;
    }>;
}
//# sourceMappingURL=inventory.repository.d.ts.map