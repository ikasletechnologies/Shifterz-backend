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

  private async resolveCustomerId(clientNameOrId?: string, phone?: string, vehicle?: string, franchiseId?: string | null): Promise<string> {
    const input = (clientNameOrId || "").trim();

    if (input) {
      const byId = await db.customer.findUnique({ where: { id: input } });
      if (byId) return byId.id;

      const byName = await db.customer.findFirst({
        where: { name: { equals: input, mode: "insensitive" }, isDeleted: false },
      });
      if (byName) return byName.id;
    }

    if (phone && phone.trim()) {
      const byPhone = await db.customer.findFirst({
        where: { phone: phone.trim(), isDeleted: false },
      });
      if (byPhone) return byPhone.id;
    }

    if (vehicle && vehicle.trim()) {
      const byVeh = await db.customer.findFirst({
        where: { vehicle: { equals: vehicle.trim(), mode: "insensitive" }, isDeleted: false },
      });
      if (byVeh) return byVeh.id;
    }

    const anyCustomer = await db.customer.findFirst({ where: { isDeleted: false } });

    const newCustId = `CUST-${Date.now()}-${Math.floor(Math.random() * 899 + 100)}`;
    try {
      const created = await db.customer.create({
        data: {
          id: newCustId,
          name: input || "Walk-in Customer",
          phone: phone || "0000000000",
          email: "",
          vehicle: vehicle || "N/A",
          model: "General",
          visits: 1,
          totalSpend: 0,
          lastVisit: new Date(),
          franchiseId: franchiseId || null,
        },
      });
      return created.id;
    } catch {
      if (anyCustomer) return anyCustomer.id;
      throw new ValidationError("Failed to resolve or create customer record for warranty.");
    }
  }

  async createWarranty(data: CreateWarrantyDTO) {
    if (!data.customerId || !data.vehicleNo || !data.itemName) {
      throw new ValidationError("Customer ID, vehicle number, and item/service name are required.");
    }
    const validCustomerId = await this.resolveCustomerId(data.customerId, undefined, data.vehicleNo);
    const warrantyNo = await this.repository.allocateWarrantyNo();
    const created = await this.repository.create({
      ...data,
      customerId: validCustomerId,
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
    const trimmedId = invoiceId.trim();
    const normInput = trimmedId.replace(/[^A-Z0-9]/g, "").toUpperCase();

    let invoice = await db.invoice.findFirst({
      where: { id: { equals: trimmedId, mode: "insensitive" }, isDeleted: false },
    });

    if (!invoice) {
      invoice = await db.invoice.findFirst({
        where: { id: { contains: trimmedId, mode: "insensitive" }, isDeleted: false },
      });
    }

    if (!invoice) {
      invoice = await db.invoice.findFirst({
        where: { jobId: { equals: trimmedId, mode: "insensitive" }, isDeleted: false },
      });
    }

    if (!invoice) {
      invoice = await db.invoice.findFirst({
        where: { vehicle: { contains: trimmedId, mode: "insensitive" }, isDeleted: false },
      });
    }

    if (!invoice) {
      const allInvoices = await db.invoice.findMany({
        where: { isDeleted: false },
      });
      invoice = allInvoices.find((inv) => {
        const normId = (inv.id || "").replace(/[^A-Z0-9]/g, "").toUpperCase();
        const normJob = (inv.jobId || "").replace(/[^A-Z0-9]/g, "").toUpperCase();
        const normVeh = (inv.vehicle || "").replace(/[^A-Z0-9]/g, "").toUpperCase();
        return (
          (normId && normId === normInput) ||
          (normJob && normJob === normInput) ||
          (normVeh && normVeh === normInput) ||
          (normId && normId.includes(normInput))
        );
      }) || null;
    }

    if (!invoice) throw new NotFoundError(`Invoice "${invoiceId}" not found in Billing module.`);

    let targetInvoice = invoice;
    if (invoice.type !== "Invoice" && invoice.jobId) {
      const converted = await db.invoice.findFirst({
        where: { jobId: invoice.jobId, type: "Invoice", isDeleted: false },
      });
      if (converted) {
        targetInvoice = converted;
      }
    }

    // Check if warranties already generated for this invoice/document
    const existingWarranties = await this.repository.findByInvoiceId(targetInvoice.id);
    if (existingWarranties.length > 0) {
      return this.syncExpiryStatuses(existingWarranties);
    }

    const validCustomerId = await this.resolveCustomerId(
      targetInvoice.client,
      targetInvoice.phone,
      targetInvoice.vehicle,
      targetInvoice.franchiseId
    );

    let items: Array<{ desc?: string; qty?: number; price?: number; warranty?: string }> = [];
    try {
      items = targetInvoice.items ? (typeof targetInvoice.items === "string" ? JSON.parse(targetInvoice.items) : (Array.isArray(targetInvoice.items) ? targetInvoice.items : [])) : [];
    } catch {
      items = [];
    }

    const createdList = [];

    // Check line items for warranty
    for (const item of items) {
      const warrantyStr = item.warranty || targetInvoice.warranty;
      if (warrantyStr && warrantyStr.trim() !== "" && warrantyStr.toLowerCase() !== "no warranty" && warrantyStr.toLowerCase() !== "none") {
        const durationDays = this.parseDurationDays(warrantyStr);
        const warrantyNo = await this.repository.allocateWarrantyNo();
        const created = await this.repository.create({
          warrantyNo,
          customerId: validCustomerId,
          vehicleNo: targetInvoice.vehicle,
          jobId: targetInvoice.jobId || undefined,
          invoiceId: targetInvoice.id,
          itemName: item.desc || targetInvoice.service,
          durationDays,
          status: "Active",
          notes: `Generated from Document #${targetInvoice.id} (${warrantyStr})`,
        });
        createdList.push(created);
      }
    }

    // If no specific item warranty was found, generate one using overall document warranty or default
    if (createdList.length === 0) {
      const warrantyText = targetInvoice.warranty && targetInvoice.warranty.trim() !== "" && targetInvoice.warranty.toLowerCase() !== "no warranty" && targetInvoice.warranty.toLowerCase() !== "none"
        ? targetInvoice.warranty
        : "3 Months / 5,000 KM";
      const durationDays = this.parseDurationDays(warrantyText);
      const warrantyNo = await this.repository.allocateWarrantyNo();
      const created = await this.repository.create({
        warrantyNo,
        customerId: validCustomerId,
        vehicleNo: targetInvoice.vehicle,
        jobId: targetInvoice.jobId || undefined,
        invoiceId: targetInvoice.id,
        itemName: targetInvoice.service || "General Workshop Service",
        durationDays,
        status: "Active",
        notes: `Generated from Document #${targetInvoice.id} (${warrantyText})`,
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
