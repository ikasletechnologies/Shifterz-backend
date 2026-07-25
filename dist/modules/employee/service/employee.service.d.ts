import { EmployeeRepository } from '../repository/employee.repository.js';
import type { CreateEmployeeDTO, UpdateEmployeeDTO } from '../validation/employee.validation.js';
export declare class EmployeeService {
    private readonly repository;
    constructor(repository?: EmployeeRepository);
    getAllEmployees(userRole: string, userFranchiseId?: string): Promise<{
        permissions: string[];
        franchise: {
            id: string;
            name: string;
            city: string;
        } | null;
        permission: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            employeeId: string;
            modules: string[];
        } | null;
        id: string;
        role: string;
        name: string;
        phone: string | null;
        status: string;
        email: string | null;
        username: string | null;
        hqControlled: boolean;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
    }[]>;
    getHqEmployees(): Promise<{
        id: string;
        role: string;
        name: string;
        phone: string | null;
        status: string;
        email: string | null;
        username: string | null;
        hqControlled: boolean;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
    }[]>;
    getTechnicians(): Promise<{
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
    }[]>;
    createEmployee(data: CreateEmployeeDTO, userRole: string, userFranchiseId?: string, isTechnicianRoute?: boolean): Promise<{
        permissions: string[];
        permission: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            employeeId: string;
            modules: string[];
        } | null;
        id: string;
        role: string;
        name: string;
        phone: string | null;
        status: string;
        email: string | null;
        username: string | null;
        hqControlled: boolean;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
    }>;
    updateEmployee(id: string, data: UpdateEmployeeDTO): Promise<{
        permissions: string[];
        permission: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            employeeId: string;
            modules: string[];
        } | null;
        id: string;
        role: string;
        name: string;
        phone: string | null;
        status: string;
        email: string | null;
        username: string | null;
        hqControlled: boolean;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
    }>;
    deleteEmployee(id: string): Promise<{
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
    }>;
}
//# sourceMappingURL=employee.service.d.ts.map