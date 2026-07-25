import { InventoryRepository } from '../repository/inventory.repository.js';
import type { CreateInventoryDTO, UpdateInventoryDTO } from '../validation/inventory.validation.js';
export declare class InventoryService {
    private readonly repository;
    constructor(repository?: InventoryRepository);
    getAllItems(): Promise<{
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
    createItem(data: CreateInventoryDTO): Promise<{
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
    updateItem(id: string, data: UpdateInventoryDTO): Promise<{
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
    deleteItem(id: string): Promise<{
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
//# sourceMappingURL=inventory.service.d.ts.map