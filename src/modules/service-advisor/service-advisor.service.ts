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
    const role = (userRole || "").toUpperCase().replace(/[\s_]+/g, "_");
    const isHQ = role === "SUPER_ADMIN" || role === "HQ_USER";
    const tenantFilter: any = {};
    if (!isHQ) {
      tenantFilter.franchiseId = userFranchiseId || "__NO_FRANCHISE__";
    }

    return computeStaffPerformance({
      role: "SERVICE_ADVISOR",
      assigneeIdField: "serviceAdvisorId",
      tenantFilter,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      franchiseId: isHQ ? query.franchiseId : (userFranchiseId || "__NO_FRANCHISE__"),
      status: query.status,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });
  }
}
