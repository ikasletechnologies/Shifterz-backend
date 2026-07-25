import { SettingsRepository } from '../repository/settings.repository.js';
import type { UpdateSettingDTO } from '../validation/settings.validation.js';
export declare class SettingsService {
    private readonly repository;
    constructor(repository?: SettingsRepository);
    getSettings(): Promise<{
        id: string;
        phone: string;
        email: string;
        address: string;
        isDeleted: boolean;
        deletedAt: Date | null;
        companyName: string;
        gstin: string;
        gstPct: number;
        currency: string;
        agents: string[];
        categories: string[];
        securityGuards: string[];
    }>;
    updateSettings(data: UpdateSettingDTO): Promise<{
        id: string;
        phone: string;
        email: string;
        address: string;
        isDeleted: boolean;
        deletedAt: Date | null;
        companyName: string;
        gstin: string;
        gstPct: number;
        currency: string;
        agents: string[];
        categories: string[];
        securityGuards: string[];
    }>;
}
//# sourceMappingURL=settings.service.d.ts.map