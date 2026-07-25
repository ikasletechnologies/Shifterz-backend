export declare class EmployeeRepository {
    findAllEmployees(tenantFilter: any): Promise<({
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
    } & {
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
    })[]>;
    findHqEmployees(): Promise<{
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
    findTechnicians(): Promise<{
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
    countFranchiseUsers(franchiseId: string): Promise<number>;
    create(id: string, data: any, hashedPassword: string | null, normalizedUsername: string | null): Promise<{
        permission: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            employeeId: string;
            modules: string[];
        } | null;
    } & {
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
    update(id: string, data: any): Promise<{
        permission: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            employeeId: string;
            modules: string[];
        } | null;
    } & {
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
    updatePermissions(employeeId: string, modules: string[]): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        employeeId: string;
        modules: string[];
    }>;
    softDelete(id: string): Promise<{
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
//# sourceMappingURL=employee.repository.d.ts.map