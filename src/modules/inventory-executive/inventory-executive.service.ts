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
    const isUnrestricted = userRole === "SUPER_ADMIN" || userRole === "HQ_USER";
    const tenantFilter: any = {};
    if (!isUnrestricted && userFranchiseId) {
      tenantFilter.franchiseId = userFranchiseId;
    }

    // A non-HQ actor's franchiseId is pinned to their own franchise — the
    // client-supplied query.franchiseId must never be allowed to override
    // it, or a franchise user could read another franchise's staff
    // performance data simply by passing ?franchiseId=<other> (only
    // tenantFilter was being scoped; this explicit filter was passed
    // through unchecked and takes precedence downstream).
    return computeStaffPerformance({
      role: "INVENTORY_EXECUTIVE",
      assigneeIdField: "technicianId",
      tenantFilter,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      franchiseId: isUnrestricted ? query.franchiseId : userFranchiseId,
      status: query.status,
      page: query.page ? parseInt(query.page, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize, 10) : undefined,
    });
  }
}
