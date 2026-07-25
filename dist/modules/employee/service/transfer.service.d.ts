import { TransferRepository } from '../repository/transfer.repository.js';
import type { CreateTransferDTO, UpdateTransferDTO } from '../validation/transfer.validation.js';
export declare class TransferService {
    private readonly repository;
    constructor(repository?: TransferRepository);
    getAllTransfers(): Promise<{
        employeeName: string;
        employeeRole: string;
        toFranchiseName: string;
        toFranchiseCity: string;
        id: string;
        role: string | null;
        status: string;
        username: string | null;
        password: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        date: Date;
        createdAt: Date;
        updatedAt: Date;
        employeeId: string | null;
        toFranchiseId: string | null;
        newMemberName: string | null;
        newMemberPhone: string | null;
        newMemberEmail: string | null;
        fromFranchiseId: string | null;
        requestedBy: string;
    }[]>;
    createTransfer(data: CreateTransferDTO, username: string, role: string): Promise<{
        id: string;
        role: string | null;
        status: string;
        username: string | null;
        password: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        date: Date;
        createdAt: Date;
        updatedAt: Date;
        employeeId: string | null;
        toFranchiseId: string | null;
        newMemberName: string | null;
        newMemberPhone: string | null;
        newMemberEmail: string | null;
        fromFranchiseId: string | null;
        requestedBy: string;
    }>;
    approveTransfer(id: string, userRole: string): Promise<{
        success: boolean;
        message: string;
    }>;
    rejectTransfer(id: string, userRole: string): Promise<{
        success: boolean;
        message: string;
    }>;
    updateTransfer(id: string, data: UpdateTransferDTO): Promise<{
        id: string;
        role: string | null;
        status: string;
        username: string | null;
        password: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        date: Date;
        createdAt: Date;
        updatedAt: Date;
        employeeId: string | null;
        toFranchiseId: string | null;
        newMemberName: string | null;
        newMemberPhone: string | null;
        newMemberEmail: string | null;
        fromFranchiseId: string | null;
        requestedBy: string;
    }>;
    deleteTransfer(id: string): Promise<{
        id: string;
        role: string | null;
        status: string;
        username: string | null;
        password: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        date: Date;
        createdAt: Date;
        updatedAt: Date;
        employeeId: string | null;
        toFranchiseId: string | null;
        newMemberName: string | null;
        newMemberPhone: string | null;
        newMemberEmail: string | null;
        fromFranchiseId: string | null;
        requestedBy: string;
    }>;
}
//# sourceMappingURL=transfer.service.d.ts.map