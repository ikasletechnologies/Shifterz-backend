import { LeadRepository } from '../repository/lead.repository.js';
import { generateSequentialId } from '../../../shared/utils/idGenerator.js';
import { db } from '../../../lib/db.js';
import { ReferralService } from './referral.service.js';
import { sendNotification, notifyManagers } from '../../../shared/services/notification.service.js';


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

  async updateLead(id: string, data: any, updatedBy?: string) {
    // Capture previous assignment before update
    const existing = await this.repository.findById(id);

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

  async deleteLead(id: string) {
    return this.repository.softDelete(id);
  }

  async getAssignmentHistory(leadId: string) {
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
  async convertLead(leadId: string, convertedBy?: string) {
    const lead = await this.repository.findById(leadId);
    if (!lead) throw new Error("Lead not found");

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

  async transferLead(id: string, toFranchiseId: string) {
    const lead = await this.repository.findById(id);
    if (!lead) throw new Error("Lead not found");
    return this.repository.update(id, { franchiseId: toFranchiseId });
  }
}

