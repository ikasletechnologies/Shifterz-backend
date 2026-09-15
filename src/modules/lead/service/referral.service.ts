import { ReferralRepository } from '../repository/referral.repository.js';
import { db } from '../../../lib/db.js';
import type { CreateReferralDTO, UpdateReferralDTO } from '../validation/referral.validation.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';

export class ReferralService {
  private repo: ReferralRepository;

  constructor() {
    this.repo = new ReferralRepository();
  }

  async createReferral(data: CreateReferralDTO, franchiseId: string | null) {
    // 1. Self-referral protection check: fetch referring customer
    const referrer = await db.customer.findUnique({
      where: { id: data.referringCustomerId }
    });

    if (referrer && referrer.phone === data.referredPhone) {
      throw new ValidationError("Self-referral is not allowed");
    }

    // Check if the referred customer phone already exists in customers
    const existingCustomer = await db.customer.findFirst({
      where: { phone: data.referredPhone, isDeleted: false }
    });

    const referral = await this.repo.create(data, franchiseId);

    // If already a customer, auto-convert the status and award points atomically
    if (existingCustomer) {
      await db.$transaction(async (tx) => {
        await tx.referral.update({
          where: { id: referral.id },
          data: {
            status: "Converted",
            referredCustomerId: existingCustomer.id,
            rewardPointsApplied: 100,
          }
        });

        await tx.customer.update({
          where: { id: data.referringCustomerId },
          data: { rewardPoints: { increment: 100 } }
        });
      });
    }

    return this.repo.findById(referral.id);
  }

  async getReferrals(franchiseId: string | null) {
    return this.repo.findMany(franchiseId);
  }

  async getReferralById(id: string) {
    return this.repo.findById(id);
  }

  async updateReferral(id: string, data: Partial<UpdateReferralDTO>) {
    return this.repo.update(id, data);
  }

  async deleteReferral(id: string) {
    return this.repo.softDelete(id);
  }

  /**
   * Scan for pending referrals matching a newly converted customer's phone
   * and apply reward points atomically to referral & customer.
   */
  async handleCustomerConversion(customerPhone: string, customerId: string, customTx?: any) {
    const runInTx = async (tx: any) => {
      const pendingReferral = await tx.referral.findFirst({
        where: { referredPhone: customerPhone, status: "Pending", isDeleted: false }
      });

      if (pendingReferral && pendingReferral.status === "Pending") {
        await tx.referral.update({
          where: { id: pendingReferral.id },
          data: {
            status: "Converted",
            referredCustomerId: customerId,
            rewardPointsApplied: 100
          }
        });

        if (pendingReferral.referringCustomerId) {
          await tx.customer.update({
            where: { id: pendingReferral.referringCustomerId },
            data: { rewardPoints: { increment: 100 } }
          });
        }
      }
    };

    if (customTx) {
      await runInTx(customTx);
    } else {
      await db.$transaction(runInTx);
    }
  }
}
