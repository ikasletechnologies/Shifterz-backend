import { computeStaffPerformance } from '../../shared/services/staffPerformance.service.js';

export interface ReceptionManagementQuery {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  franchiseId?: string;
  status?: string;
  page?: string;
  pageSize?: string;
}

export class ReceptionService {
  async getManagement(userRole: string, userFranchiseId: string | undefined, query: ReceptionManagementQuery) {
    const normalizedRole = (userRole || '').toUpperCase().replace(/[\s_]+/g, '_');
    const isHQ = normalizedRole === 'SUPER_ADMIN' || normalizedRole === 'HQ_USER';

    const tenantFilter: any = {};
    if (!isHQ) {
      // Non-HQ users are always scoped to their own franchise.
      // Sentinel prevents returning all rows if franchiseId is missing.
      tenantFilter.franchiseId = userFranchiseId || '__NO_FRANCHISE__';
    }

    return computeStaffPerformance({
      role: "RECEPTION_EXECUTIVE",
      assigneeIdField: "technicianId",
      tenantFilter,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      franchiseId: query.franchiseId,
      status: query.status,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });
  }
}
