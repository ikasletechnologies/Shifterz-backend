import { db } from '../../../lib/db.js';
import type { CreateReferralDTO, UpdateReferralDTO } from '../validation/referral.validation.js';

export class ReferralRepository {
  async create(data: CreateReferralDTO, franchiseId: string | null) {
    return db.referral.create({
      data: {
        referringCustomerId: data.referringCustomerId,
        referringCustomer: data.referringCustomer,
        referredLeadId: data.referredLeadId ?? null,
        referredCustomerId: data.referredCustomerId ?? null,
        referredName: data.referredName,
        referredPhone: data.referredPhone,
        status: "Pending",
        franchiseId,
      }
    });
  }

  async findById(id: string) {
    return db.referral.findUnique({ where: { id } });
  }

  async findByReferredPhone(phone: string) {
    return db.referral.findFirst({ where: { referredPhone: phone, isDeleted: false } });
  }

  async findMany(franchiseId: string | null) {
    return db.referral.findMany({
      where: {
        isDeleted: false,
        ...(franchiseId ? { franchiseId } : {}),
      },
      orderBy: { referralDate: 'desc' }
    });
  }

  async update(id: string, data: Partial<UpdateReferralDTO>) {
    return db.referral.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.rewardPointsApplied !== undefined && { rewardPointsApplied: data.rewardPointsApplied }),
        ...(data.referredCustomerId !== undefined && { referredCustomerId: data.referredCustomerId }),
      }
    });
  }

  async softDelete(id: string) {
    return db.referral.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() }
    });
  }
}
