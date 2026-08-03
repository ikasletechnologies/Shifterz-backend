import { computeStaffPerformance } from '../../shared/services/staffPerformance.service.js';

export interface ServiceAdvisorManagementQuery {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  franchiseId?: string;
  status?: string;
  page?: string;
  pageSize?: string;
}

export class ServiceAdvisorService {
  async getManagement(userRole: string, userFranchiseId: string | undefined, query: ServiceAdvisorManagementQuery) {
    const tenantFilter: any = {};
    if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER" && userFranchiseId) {
      tenantFilter.franchiseId = userFranchiseId;
    }

    return computeStaffPerformance({
      role: "SERVICE_ADVISOR",
      assigneeIdField: "serviceAdvisorId",
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
