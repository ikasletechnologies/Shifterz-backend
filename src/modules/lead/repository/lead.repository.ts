import { db } from '../../../lib/db.js';

type FranchiseScopeWhere = { franchiseId?: string | null };

export class LeadRepository {
  async findAll(tenantFilter: any) {
    return db.lead.findMany({ where: tenantFilter, orderBy: { date: "desc" } });
  }

  async findById(id: string, scopeWhere: FranchiseScopeWhere = {}) {
    return db.lead.findFirst({ where: { id, ...scopeWhere } });
  }

  async create(data: any) {
    return db.lead.create({ data });
  }

  async update(id: string, data: any) {
    return db.lead.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string) {
    return db.lead.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date().toISOString() },
    });
  }

  async findCustomerByPhone(phone: string) {
    return db.customer.findFirst({ where: { phone } });
  }

  async createCustomer(data: any) {
    return db.customer.create({ data });
  }

  async deleteCustomer(id: string) {
    return db.customer.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
}
