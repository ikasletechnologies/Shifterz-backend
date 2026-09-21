import { db } from '../../../lib/db.js';
import type { CreateFranchiseDTO, UpdateFranchiseDTO } from '../validation/franchise.validation.js';

export class FranchiseRepository {
  async findAll() {
    return db.franchise.findMany({
      where: { isDeleted: false },
      orderBy: { since: 'asc' }
    });
  }

  async findById(id: string) {
    return db.franchise.findFirst({
      where: { id, isDeleted: false }
    });
  }

  async create(id: string, data: CreateFranchiseDTO) {
    return db.franchise.create({
      data: {
        id,
        name: data.name,
        city: data.city,
        owner: data.owner,
        phone: data.phone,
        since: new Date().toISOString(),
        revenue: data.revenue || 0,
        jobs: data.jobs || 0,
        royaltyPct: data.royaltyPct || 0,
        status: data.status || "Active",
        businessName: data.businessName || null,
        gstNumber: data.gstNumber || null,
        email: data.email || null,
        address: data.address || null,
        state: data.state || null,
        pinCode: data.pinCode || null,
        licenseStatus: data.licenseStatus || "Active",
        gstRegistrationType: data.gstRegistrationType || null
      }
    });
  }

  async update(id: string, data: UpdateFranchiseDTO) {
    return db.franchise.update({
      where: { id },
      data
    });
  }

  async softDelete(id: string) {
    return db.franchise.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date().toISOString() }
    });
  }
}
