import { LeadRepository } from '../repository/lead.repository.js';
import { generateSequentialId } from '../../../shared/utils/idGenerator.js';
import { db } from '../../../lib/db.js';
import { ReferralService } from './referral.service.js';
import { sendNotification, notifyManagers } from '../../../shared/services/notification.service.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { resolveDataScope, scopeWhere, type ScopeActor } from '../../../shared/scope/dataScope.js';


export class LeadService {
  private repository: LeadRepository;
  private referralService: ReferralService;

  constructor() {
    this.repository = new LeadRepository();
    this.referralService = new ReferralService();
  }

  async getLeads(tenantFilter: any) {
    return this.repository.findAll(tenantFilter);
  }

  async createLead(data: any, franchiseId: string | null, createdBy?: string) {
    const leadId = await generateSequentialId("L");
    const leadDate = data.date ? new Date(data.date) : new Date();
    const validDate = isNaN(leadDate.getTime()) ? new Date() : leadDate;

    const newLead = await this.repository.create({
      id: leadId,
      name: data.name,
      phone: data.phone || "",
      alternateNumber: data.alternateNumber || null,
      email: data.email || "",
      city: data.city || null,
      source: data.source || "JustDial",
      service: data.service || "",
      vehicle: data.vehicle || "",
      vehicleMake: data.vehicleMake || null,
      vehicleModel: data.vehicleModel || null,
      assignedTo: data.assignedTo || "",
      assignedToId: data.assignedToId || null,
      assignedBy: createdBy || null,
      assignedAt: new Date(),
      status: data.status || "New",
      notes: data.notes || "",
      budget: String(data.budget || "0"),
      priority: data.priority || "Medium",
      date: validDate,
      franchiseId: franchiseId,
      lostReason: data.status === "Lost" ? data.lostReason : null,
    });

    // Write initial assignment history row
    if (newLead.assignedTo && newLead.assignedTo.trim() !== "") {
      try {
        await db.leadAssignmentHistory.create({
          data: {
            leadId: newLead.id,
            assignedTo: newLead.assignedTo,
            assignedToId: newLead.assignedToId,
            assignedBy: createdBy || "System",
            reason: "Initial assignment"
          }
        });
      } catch (err) {
        console.error("Assignment history error:", err);
      }
    }

    if (newLead.status === "Converted" && newLead.phone) {
      await this.handleConvertedLeadCustomer(newLead, franchiseId);
    }

    // Trigger Notifications & Alerts
    if (newLead.assignedToId) {
      await sendNotification(
        newLead.assignedToId,
        "🎯 New Lead Assigned",
        `You have been assigned a new lead: ${newLead.name} (${newLead.service})`
      ).catch(console.error);
    } else {
      await notifyManagers(
        franchiseId,
        "⚠️ Unassigned Lead Registered",
        `A new lead has been registered without an assignee: ${newLead.name}`
      ).catch(console.error);
    }

    const budgetVal = parseFloat(newLead.budget);
    if (!isNaN(budgetVal) && budgetVal >= 50000 && !["converted", "lost"].includes(newLead.status.toLowerCase())) {
      await notifyManagers(
        franchiseId,
        "💎 High-Value Lead Alert",
        `High-value lead (${newLead.budget} INR) registered: ${newLead.name} for ${newLead.service}`
      ).catch(console.error);
    }


    return newLead;
  }

  async updateLead(id: string, data: any, updatedBy?: string, actor?: ScopeActor) {
    // Capture previous assignment before update
    const scope = resolveDataScope(actor);
    const existing = await this.repository.findById(id, scopeWhere(scope));
    if (!existing) throw new NotFoundError("Lead not found");

    const updatedLead = await this.repository.update(id, {
      name: data.name,
      phone: data.phone,
      alternateNumber: data.alternateNumber,
      email: data.email,
      city: data.city,
      source: data.source,
      service: data.service,
      vehicle: data.vehicle,
      vehicleMake: data.vehicleMake,
      vehicleModel: data.vehicleModel,
      assignedTo: data.assignedTo,
      assignedToId: data.assignedToId,
      status: data.status,
      notes: data.notes,
      budget: String(data.budget || "0"),
      priority: data.priority,
      date: data.date,
      lostReason: data.status === "Lost" ? data.lostReason : null,
    });

    // Write assignment history row if assignee changed
    const assigneeChanged =
      data.assignedTo !== undefined &&
      existing &&
      data.assignedTo !== existing.assignedTo;

    if (assigneeChanged && data.assignedTo) {
      await db.leadAssignmentHistory.create({
        data: {
          leadId: id,
          assignedTo: data.assignedTo,
          assignedToId: data.assignedToId || null,
          assignedBy: updatedBy || "System",
          reason: data.reassignReason || "Reassigned"
        }
      });

      // Update the lead's own assignment timestamp
      await this.repository.update(id, {
        assignedBy: updatedBy || null,
        assignedAt: new Date()
      });
    }

    if (updatedLead.status === "Converted" && updatedLead.phone) {
      await this.handleConvertedLeadCustomer(updatedLead, updatedLead.franchiseId);
    } else if (updatedLead.phone) {
      const existingCust = await this.repository.findCustomerByPhone(updatedLead.phone);
      if (existingCust && existingCust.visits === 0) {
        await this.repository.deleteCustomer(existingCust.id);
      }
    }

    return updatedLead;
  }

  async deleteLead(id: string, actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    const existing = await this.repository.findById(id, scopeWhere(scope));
    if (!existing) throw new NotFoundError("Lead not found");
    return this.repository.softDelete(id);
  }

  async getAssignmentHistory(leadId: string, actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    const lead = await this.repository.findById(leadId, scopeWhere(scope));
    if (!lead) throw new NotFoundError("Lead not found");
    return db.leadAssignmentHistory.findMany({
      where: { leadId },
      orderBy: { assignedAt: "desc" }
    });
  }

  /**
   * Explicitly convert a lead → customer.
   * Can also be triggered implicitly when status is set to "Converted".
   * Idempotent: safe to call multiple times on the same lead.
   */
  async convertLead(leadId: string, convertedBy?: string, actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    const lead = await this.repository.findById(leadId, scopeWhere(scope));
    if (!lead) throw new NotFoundError("Lead not found");

    const result = await this.handleConvertedLeadCustomer(lead, lead.franchiseId);
    return result;
  }

  /**
   * Core conversion logic.
   * - Creates Customer if one doesn't already exist for this lead.
   * - Transfers ALL lead fields: city, alternateNumber, vehicleMake, vehicleModel, etc.
   * - Bi-directional link: lead.customerId ↔ customer.convertedLeadId.
   * - Lead history (followUps, assignmentHistory, transferHistory) is untouched.
   */
  private async handleConvertedLeadCustomer(lead: any, franchiseId: string | null) {
    const conversionTime = new Date();

    // Check if already converted (idempotent guard)
    if (lead.customerId) {
      return db.customer.findUnique({ where: { id: lead.customerId } });
    }

    // Also guard against duplicate by phone (existing customer flow)
    let customer = await this.repository.findCustomerByPhone(lead.phone);

    if (!customer) {
      const customerId = await generateSequentialId("CUS");
      customer = await this.repository.createCustomer({
        id: customerId,
        name: lead.name,
        phone: lead.phone,
        alternateNumber: lead.alternateNumber ?? null,
        email: lead.email ?? "",
        vehicle: lead.vehicle ?? "",
        model: lead.vehicleModel ?? "",
        vehicleMake: lead.vehicleMake ?? null,
        vehicleModel: lead.vehicleModel ?? null,
        city: lead.city ?? null,
        visits: 0,
        totalSpend: 0,
        lastVisit: conversionTime,
        convertedLeadId: lead.id,   // link customer → lead
        convertedAt: conversionTime,
        franchiseId,
      });
    } else if (!customer.convertedLeadId) {
      // Existing customer by phone — update the back-link if not already set
      customer = await db.customer.update({
        where: { id: customer.id },
        data: {
          convertedLeadId: lead.id,
          convertedAt: conversionTime,
          // Enrich any missing fields
          vehicleMake: customer.vehicleMake ?? lead.vehicleMake ?? null,
          vehicleModel: customer.vehicleModel ?? lead.vehicleModel ?? null,
          city: customer.city ?? lead.city ?? null,
          alternateNumber: customer.alternateNumber ?? lead.alternateNumber ?? null,
        },
      });
    }

    // Link lead → customer and stamp convertedAt
    await this.repository.update(lead.id, {
      customerId: customer!.id,
      convertedAt: conversionTime,
      status: "Converted",
    });

    // Check for pending referrals matching this customer phone
    await this.referralService.handleCustomerConversion(customer.phone, customer.id);

    return customer;
  }

  // Cross-franchise lead transfer. Authority model:
  //   SUPER_ADMIN / HQ_USER      -> always allowed
  //   FRANCHISE_ADMIN            -> only if their own (source) franchise has
  //                                 canTransferLeads granted by HQ; the lead
  //                                 must already be in-scope for them (the
  //                                 scoped findById below enforces this)
  //   everyone else              -> forbidden
  // Writes franchiseId + a one-time originalFranchiseId snapshot + a
  // LeadTransferHistory row atomically — all three fields already existed in
  // the schema but were never wired up by the previous stub implementation.
  async transferLead(
    id: string,
    toFranchiseId: string,
    actor?: ScopeActor & { id?: string; name?: string },
    reason?: string
  ) {
    const scope = resolveDataScope(actor);
    const lead = await this.repository.findById(id, scopeWhere(scope));
    if (!lead) throw new NotFoundError("Lead not found");

    const role = (actor?.role || "").split("|")[0];
    const isHQ = role === "SUPER_ADMIN" || role === "HQ_USER";

    const fromFranchiseId = lead.franchiseId;
    const fromFranchise = fromFranchiseId
      ? await db.franchise.findUnique({ where: { id: fromFranchiseId } })
      : null;

    if (!isHQ) {
      if (role !== "FRANCHISE_ADMIN" || !fromFranchise || fromFranchise.isDeleted || !fromFranchise.canTransferLeads) {
        throw new ForbiddenError("You do not have permission to transfer leads across franchises.");
      }
    }

    if (!toFranchiseId || toFranchiseId === fromFranchiseId) {
      throw new ValidationError("A valid, different target franchise is required.");
    }

    const targetFranchise = await db.franchise.findUnique({ where: { id: toFranchiseId } });
    if (!targetFranchise || targetFranchise.isDeleted || targetFranchise.status !== "Active") {
      throw new ValidationError("Target franchise is not a valid, active franchise.");
    }

    const [updatedLead] = await db.$transaction([
      db.lead.update({
        where: { id },
        data: {
          franchiseId: toFranchiseId,
          originalFranchiseId: lead.originalFranchiseId ?? fromFranchiseId ?? null,
        },
      }),
      db.leadTransferHistory.create({
        data: {
          leadId: id,
          fromFranchiseId,
          fromFranchiseName: fromFranchise?.name ?? null,
          toFranchiseId,
          toFranchiseName: targetFranchise.name,
          transferredBy: actor?.id || actor?.name || "System",
          reason: reason ?? null,
        },
      }),
    ]);

    return updatedLead;
  }
}

