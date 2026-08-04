import { db } from '../../../lib/db.js';
import { FollowUpRepository } from '../repository/followup.repository.js';
import type { CreateFollowUpDTO, UpdateFollowUpDTO } from '../validation/followup.validation.js';

export class FollowUpService {
  private repo: FollowUpRepository;

  constructor() {
    this.repo = new FollowUpRepository();
  }

  /**
   * Add a new follow-up entry to a lead.
   * If leadStatusUpdate is provided, the lead's status is also updated atomically.
   */
  async addFollowUp(
    leadId: string,
    data: CreateFollowUpDTO,
    performedBy: string,
    performedById: string | null,
    franchiseId: string | null,
  ) {
    // Verify the lead exists and is not deleted
    const lead = await db.lead.findFirst({ where: { id: leadId, isDeleted: false } });
    if (!lead) throw new Error(`Lead ${leadId} not found`);

    // Create follow-up
    const followUp = await this.repo.create(leadId, data, performedBy, performedById, franchiseId);

    // Optionally update lead status in the same logical transaction
    if (data.leadStatusUpdate && data.leadStatusUpdate !== lead.status) {
      await db.lead.update({
        where: { id: leadId },
        data: { status: data.leadStatusUpdate },
      });
    }

    return followUp;
  }

  /** Return full unbounded follow-up history for a lead */
  async getHistory(leadId: string) {
    const lead = await db.lead.findFirst({ where: { id: leadId, isDeleted: false } });
    if (!lead) throw new Error(`Lead ${leadId} not found`);
    return this.repo.findByLead(leadId);
  }

  /** Correct / edit a follow-up (the record is never physically deleted) */
  async updateFollowUp(id: string, data: UpdateFollowUpDTO) {
    const existing = await this.repo.findById(id);
    if (!existing) throw new Error(`Follow-up ${id} not found`);
    return this.repo.update(id, data);
  }

  /** Upcoming scheduled follow-ups for notification / dashboard widgets */
  async getUpcoming(franchiseId: string | null, days?: number) {
    return this.repo.getUpcoming(franchiseId, days);
  }

  /** Count of follow-ups logged for a lead */
  async count(leadId: string) {
    return this.repo.countByLead(leadId);
  }
}
