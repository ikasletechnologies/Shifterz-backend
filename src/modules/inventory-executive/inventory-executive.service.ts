import { computeStaffPerformance } from '../../shared/services/staffPerformance.service.js';

export interface InventoryExecutiveManagementQuery {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  franchiseId?: string;
  status?: string;
  page?: string;
  pageSize?: string;
}

export class InventoryExecutiveService {
  async getManagement(userRole: string, userFranchiseId: string | undefined, query: InventoryExecutiveManagementQuery) {
    const tenantFilter: any = {};
    if (userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER" && userFranchiseId) {
      tenantFilter.franchiseId = userFranchiseId;
    }

    return computeStaffPerformance({
      role: "INVENTORY_EXECUTIVE",
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
