export declare class AuthService {
    login(username: string, password: string): Promise<{
        token: string;
        user: {
            technicianId?: string | undefined;
            id: string;
            username: string | null;
            role: string;
            permissions: string[];
            franchiseId: string | null;
        };
    }>;
    getMe(userId: string): Promise<{
        technicianId?: string | undefined;
        id: string;
        username: string | null;
        role: string;
        permissions: string[];
        franchiseId: string | null;
    }>;
    updateProfile(userId: string, data: any): Promise<{
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
    getRolePermissions(): Promise<{
        role: string;
        permissions: string[];
    }[]>;
    updateRolePermissions(role: string, permissions: string[]): Promise<{
        role: string;
        permissions: string[];
    }>;
}
export declare const authService: AuthService;
//# sourceMappingURL=auth.service.d.ts.map