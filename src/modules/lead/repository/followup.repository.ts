import { db } from '../../../lib/db.js';
import type { CreateFollowUpDTO, UpdateFollowUpDTO } from '../validation/followup.validation.js';

export class FollowUpRepository {
  /** Create a new follow-up record */
  async create(leadId: string, data: CreateFollowUpDTO, performedBy: string, performedById: string | null, franchiseId: string | null) {
    return db.leadFollowUp.create({
      data: {
        leadId,
        followUpDate: new Date(data.followUpDate),
        mode: data.mode,
        notes: data.notes,
        outcome: data.outcome ?? null,
        nextAction: data.nextAction ?? null,
        nextFollowUpDate: data.nextFollowUpDate ? new Date(data.nextFollowUpDate) : null,
        leadStatusUpdate: data.leadStatusUpdate ?? null,
        performedBy,
        performedById,
        franchiseId,
      },
    });
  }

  /** Get all follow-ups for a lead (oldest first → full history) */
  async findByLead(leadId: string) {
    return db.leadFollowUp.findMany({
      where: { leadId },
      orderBy: { followUpDate: 'asc' },
    });
  }

  /** Get a single follow-up by id */
  async findById(id: string) {
    return db.leadFollowUp.findUnique({ where: { id } });
  }

  /** Update a follow-up (corrections only – history row is never deleted) */
  async update(id: string, data: UpdateFollowUpDTO) {
    return db.leadFollowUp.update({
      where: { id },
      data: {
        ...(data.followUpDate && { followUpDate: new Date(data.followUpDate) }),
        ...(data.mode && { mode: data.mode }),
        ...(data.notes && { notes: data.notes }),
        outcome: data.outcome ?? undefined,
        nextAction: data.nextAction ?? undefined,
        nextFollowUpDate: data.nextFollowUpDate !== undefined
          ? (data.nextFollowUpDate ? new Date(data.nextFollowUpDate) : null)
          : undefined,
        leadStatusUpdate: data.leadStatusUpdate ?? undefined,
      },
    });
  }

  /** Count all follow-ups for a lead */
  async countByLead(leadId: string) {
    return db.leadFollowUp.count({ where: { leadId } });
  }

  /** Pending / upcoming follow-ups for a franchise (next 7 days) */
  async getUpcoming(franchiseId: string | null, days = 7) {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + days);
    return db.leadFollowUp.findMany({
      where: {
        ...(franchiseId ? { franchiseId } : {}),
        nextFollowUpDate: { gte: from, lte: to },
      },
      orderBy: { nextFollowUpDate: 'asc' },
    });
  }
}
