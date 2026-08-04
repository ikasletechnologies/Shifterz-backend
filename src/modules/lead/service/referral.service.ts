import { ReferralRepository } from '../repository/referral.repository.js';
import { db } from '../../../lib/db.js';
import type { CreateReferralDTO, UpdateReferralDTO } from '../validation/referral.validation.js';

export class ReferralService {
  private repo: ReferralRepository;

  constructor() {
    this.repo = new ReferralRepository();
  }

  async createReferral(data: CreateReferralDTO, franchiseId: string | null) {
    // Check if the referred customer phone already exists in customers
    const existingCustomer = await db.customer.findFirst({
      where: { phone: data.referredPhone }
    });

    const referral = await this.repo.create(data, franchiseId);

    // If already a customer, auto-convert the status
    if (existingCustomer) {
      await this.repo.update(referral.id, {
        status: "Converted",
        referredCustomerId: existingCustomer.id,
      });
      // Apply default referral reward points (e.g. 100 points)
      await this.repo.update(referral.id, { rewardPointsApplied: 100 });
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
   * and apply reward points to the referral record.
   */
  async handleCustomerConversion(customerPhone: string, customerId: string) {
    const pendingReferral = await this.repo.findByReferredPhone(customerPhone);
    if (pendingReferral && pendingReferral.status === "Pending") {
      // Apply 100 reward points and set Status to Converted
      await this.repo.update(pendingReferral.id, {
        status: "Converted",
        referredCustomerId: customerId,
        rewardPointsApplied: 100
      });
    }
  }
}
