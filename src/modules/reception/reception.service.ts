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
    const tenantFilter: any = {};
    if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER" && userFranchiseId) {
      tenantFilter.franchiseId = userFranchiseId;
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
