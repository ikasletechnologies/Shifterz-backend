import { PaymentsRepository } from '../repository/payments.repository.js';
import type { CreatePaymentDTO } from '../validation/payments.validation.js';
export declare class PaymentsService {
    private readonly repository;
    constructor(repository?: PaymentsRepository);
    getAllPayments(): Promise<{
        id: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        client: string;
        amount: number;
        date: Date;
        notes: string;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        invoiceId: string;
        mode: string;
        ref: string;
    }[]>;
    createPayment(data: CreatePaymentDTO): Promise<{
        id: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        client: string;
        amount: number;
        date: Date;
        notes: string;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        invoiceId: string;
        mode: string;
        ref: string;
    }>;
    deletePayment(id: string): Promise<{
        id: string;
        franchiseId: string | null;
        isDeleted: boolean;
        deletedAt: Date | null;
        client: string;
        amount: number;
        date: Date;
        notes: string;
        createdAt: Date;
        updatedAt: Date;
        createdBy: string | null;
        invoiceId: string;
        mode: string;
        ref: string;
    }>;
}
//# sourceMappingURL=payments.service.d.ts.map