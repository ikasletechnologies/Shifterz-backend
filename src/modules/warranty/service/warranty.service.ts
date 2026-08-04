import { WarrantyRepository } from "../repository/warranty.repository.js";
import type { CreateWarrantyDTO, UpdateWarrantyDTO, WarrantyClaimDTO, WarrantyClaimRecord } from "../types/warranty.types.js";
import { ValidationError, NotFoundError } from "../../../shared/errors/index.js";
import { db } from "../../../lib/db.js";

export class WarrantyService {
  private repository = new WarrantyRepository();

  private parseDurationDays(warrantyText?: string | null): number {
    if (!warrantyText) return 365;
    const lower = warrantyText.toLowerCase().trim();
    if (lower.includes("6 month")) return 180;
    if (lower.includes("3 month")) return 90;
    if (lower.includes("5 year")) return 1825;
    if (lower.includes("3 year")) return 1095;
    if (lower.includes("2 year")) return 730;
    if (lower.includes("1 year")) return 365;
    const num = parseInt(lower, 10);
    if (!isNaN(num) && num > 0) return num;
    return 365;
  }

  private async syncExpiryStatuses(warranties: any[]): Promise<any[]> {
    const now = new Date();
    const updated = [];
    for (const w of warranties) {
      let currentStatus = w.status;
      if (currentStatus === "Active" && new Date(w.expiryDate) < now) {
        await this.repository.update(w.id, { status: "Expired" });
        currentStatus = "Expired";
      }
      let parsedClaims: WarrantyClaimRecord[] = [];
      try {
        parsedClaims = w.claims ? JSON.parse(w.claims) : [];
      } catch {
        parsedClaims = [];
      }
      updated.push({
        ...w,
        status: currentStatus,
        claimsList: parsedClaims,
      });
    }
    return updated;
  }

  async getAllWarranties(filter: { customerId?: string; vehicleNo?: string; status?: string; search?: string }) {
    const warranties = await this.repository.findAll(filter);
    return this.syncExpiryStatuses(warranties);
  }

  async getWarrantyById(id: string) {
    const warranty = await this.repository.findById(id);
    if (!warranty) throw new NotFoundError("Warranty not found");
    const [synced] = await this.syncExpiryStatuses([warranty]);
    return synced;
  }

  async createWarranty(data: CreateWarrantyDTO) {
    if (!data.customerId || !data.vehicleNo || !data.itemName) {
      throw new ValidationError("Customer ID, vehicle number, and item/service name are required.");
    }
    const warrantyNo = await this.repository.allocateWarrantyNo();
    const created = await this.repository.create({
      ...data,
      warrantyNo,
    });
    const [synced] = await this.syncExpiryStatuses([created]);
    return synced;
  }

  async updateWarranty(id: string, data: UpdateWarrantyDTO) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundError("Warranty not found");

    // PRD rule: Expired warranties shall become read-only.
    if (existing.status === "Expired" || new Date(existing.expiryDate) < new Date()) {
      throw new ValidationError("Expired warranties are read-only and cannot be modified.");
    }

    const updated = await this.repository.update(id, data);
    const [synced] = await this.syncExpiryStatuses([updated]);
    return synced;
  }

  async addClaim(id: string, data: WarrantyClaimDTO) {
    if (!data.description) {
      throw new ValidationError("Claim description is required.");
    }
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundError("Warranty not found");

    // PRD rule: Expired warranties shall become read-only.
    if (existing.status === "Expired" || new Date(existing.expiryDate) < new Date()) {
      throw new ValidationError("Expired warranties are read-only and cannot be claimed.");
    }

    let existingClaims: WarrantyClaimRecord[] = [];
    try {
      existingClaims = existing.claims ? (typeof existing.claims === "string" ? JSON.parse(existing.claims) : existing.claims) : [];
    } catch {
      existingClaims = [];
    }

    const newClaim: WarrantyClaimRecord = {
      id: `CLM-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      claimDate: new Date().toISOString(),
      description: data.description,
      resolution: data.resolution || "Pending Investigation",
      claimedBy: data.claimedBy || "Authorized User",
    };

    const updated = await this.repository.addClaim(id, existingClaims, newClaim, data.status);
    const [synced] = await this.syncExpiryStatuses([updated]);
    return synced;
  }

  async generateFromInvoice(invoiceId: string) {
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, isDeleted: false },
    });
    if (!invoice) throw new NotFoundError("Invoice not found.");
    if (invoice.type !== "Invoice") {
      throw new ValidationError("Warranties can only be generated from completed Invoices.");
    }

    // Check if warranties already generated for this invoice
    const existingWarranties = await this.repository.findByInvoiceId(invoiceId);
    if (existingWarranties.length > 0) {
      return this.syncExpiryStatuses(existingWarranties);
    }

    let items: Array<{ desc?: string; qty?: number; price?: number; warranty?: string }> = [];
    try {
      items = invoice.items ? (typeof invoice.items === "string" ? JSON.parse(invoice.items) : (Array.isArray(invoice.items) ? invoice.items : [])) : [];
    } catch {
      items = [];
    }

    const createdList = [];

    // Check line items for warranty
    for (const item of items) {
      const warrantyStr = item.warranty || invoice.warranty;
      if (warrantyStr && warrantyStr.trim() !== "" && warrantyStr.toLowerCase() !== "no warranty" && warrantyStr.toLowerCase() !== "none") {
        const durationDays = this.parseDurationDays(warrantyStr);
        const warrantyNo = await this.repository.allocateWarrantyNo();
        const customerId = invoice.client;
        const created = await this.repository.create({
          warrantyNo,
          customerId,
          vehicleNo: invoice.vehicle,
          jobId: invoice.jobId || undefined,
          invoiceId: invoice.id,
          itemName: item.desc || invoice.service,
          durationDays,
          status: "Active",
          notes: `Generated from Invoice #${invoice.id} (${warrantyStr})`,
        });
        createdList.push(created);
      }
    }

    // If no specific item warranty was found but invoice has an overall warranty, generate one
    if (createdList.length === 0 && invoice.warranty && invoice.warranty.trim() !== "" && invoice.warranty.toLowerCase() !== "no warranty") {
      const durationDays = this.parseDurationDays(invoice.warranty);
      const warrantyNo = await this.repository.allocateWarrantyNo();
      const created = await this.repository.create({
        warrantyNo,
        customerId: invoice.client,
        vehicleNo: invoice.vehicle,
        jobId: invoice.jobId || undefined,
        invoiceId: invoice.id,
        itemName: invoice.service || "General Workshop Service",
        durationDays,
        status: "Active",
        notes: `Generated from Invoice #${invoice.id} (${invoice.warranty})`,
      });
      createdList.push(created);
    }

    return this.syncExpiryStatuses(createdList);
  }

  async deleteWarranty(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundError("Warranty not found");
    // PRD rule: Expired warranties shall become read-only. History remains permanent.
    if (existing.status === "Expired") {
      throw new ValidationError("Expired warranties are read-only and cannot be deleted.");
    }
    await this.repository.softDelete(id);
    return { success: true };
  }
}
