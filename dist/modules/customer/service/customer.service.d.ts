import { CustomerRepository } from '../repository/customer.repository.js';
import type { CreateCustomerDTO } from '../validation/customer.validation.js';
export declare class CustomerService {
    private readonly repository;
    constructor(repository?: CustomerRepository);
    getCustomers(tenantFilter: any): Promise<{
        id: string;
        name: string;
        phone: string;
        email: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        vehicle: string;
        model: string;
        visits: number;
        totalSpend: number;
        lastVisit: Date;
    }[]>;
    createCustomer(data: CreateCustomerDTO, franchiseId: string | null): Promise<{
        id: string;
        name: string;
        phone: string;
        email: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        vehicle: string;
        model: string;
        visits: number;
        totalSpend: number;
        lastVisit: Date;
    }>;
    deleteCustomer(id: string): Promise<{
        id: string;
        name: string;
        phone: string;
        email: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        vehicle: string;
        model: string;
        visits: number;
        totalSpend: number;
        lastVisit: Date;
    }>;
}
//# sourceMappingURL=customer.service.d.ts.map