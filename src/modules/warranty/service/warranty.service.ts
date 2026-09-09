import { WarrantyRepository } from "../repository/warranty.repository.js";
import type { CreateWarrantyDTO, UpdateWarrantyDTO, WarrantyClaimDTO, WarrantyClaimRecord } from "../types/warranty.types.js";
import { ValidationError, NotFoundError } from "../../../shared/errors/index.js";
import { db } from "../../../lib/db.js";
import { resolveDataScope, scopeWhere, type ScopeActor } from "../../../shared/scope/dataScope.js";
import { assertQualifyingInvoice } from "./invoiceQualification.helper.js";
import { assertWarrantyModifyAuthority } from "./warrantyAuthority.helper.js";

type ActingUser = ScopeActor & { id?: string; name?: string };

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

  // WTY-01A — franchise scoping (Fix 2). Warranty has no franchiseId of its
  // own; ownership is derived through the required, always-present
  // customerId -> Customer.franchiseId relation (confirmed reliable for
  // every record in the WTY-01 audit — no schema change needed). The scope
  // is applied at the query level via the repository's `customer:
  // scopeWhere` filter, not fetched-then-checked.
  async getAllWarranties(filter: { customerId?: string; vehicleNo?: string; status?: string; search?: string }, actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    const warranties = await this.repository.findAll(filter, scopeWhere(scope));
    return this.syncExpiryStatuses(warranties);
  }

  async getWarrantyById(id: string, actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    const warranty = await this.repository.findById(id, scopeWhere(scope));
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

  // WTY-01C (D-W2, locked) — manual creation now REQUIRES a qualifying
  // invoice (real Invoice type, not deleted, not Cancelled — the same bar
  // generateFromInvoice's automatic trigger already applies) and derives
  // customer/vehicle/franchise identity from that invoice rather than
  // trusting client-supplied customerId/vehicleNo, closing the gap where a
  // standalone warranty could be manufactured for an arbitrary
  // customer/vehicle with no qualifying document behind it. Franchise scope
  // is enforced the same way generateFromInvoice's manual trigger does it —
  // a 404 for an out-of-scope invoice, not a 403, matching this codebase's
  // don't-confirm-existence convention.
  async createWarranty(data: CreateWarrantyDTO, actor?: ScopeActor) {
    if (!data.invoiceId || !data.itemName) {
      throw new ValidationError("Invoice ID and item/service name are required.");
    }

    const scope = resolveDataScope(actor);
    const invoice = await db.invoice.findFirst({ where: { id: data.invoiceId } });
    assertQualifyingInvoice(invoice);
    if (!scope.unrestricted && (invoice.franchiseId ?? null) !== scope.franchiseId) {
      throw new NotFoundError("Invoice not found.");
    }

    const validCustomerId = await this.resolveCustomerId(invoice.client, invoice.phone, invoice.vehicle, invoice.franchiseId);
    const warrantyNo = await this.repository.allocateWarrantyNo();
    const created = await this.repository.create({
      ...data,
      customerId: validCustomerId,
      vehicleNo: invoice.vehicle,
      jobId: data.jobId || invoice.jobId || undefined,
      invoiceId: invoice.id,
      warrantyNo,
    });
    const [synced] = await this.syncExpiryStatuses([created]);
    return synced;
  }

  // WTY-01C (D-W5, locked) — SUPER_ADMIN/HQ_USER only.
  async updateWarranty(id: string, data: UpdateWarrantyDTO, actor?: ScopeActor) {
    assertWarrantyModifyAuthority(actor?.role);
    const scope = resolveDataScope(actor);
    const existing = await this.repository.findById(id, scopeWhere(scope));
    if (!existing) throw new NotFoundError("Warranty not found");

    // PRD rule: Expired warranties shall become read-only.
    if (existing.status === "Expired" || new Date(existing.expiryDate) < new Date()) {
      throw new ValidationError("Expired warranties are read-only and cannot be modified.");
    }

    const updated = await this.repository.update(id, data);
    const [synced] = await this.syncExpiryStatuses([updated]);
    return synced;
  }

  // WTY-01C (D-W5, locked) — SUPER_ADMIN/HQ_USER only.
  async addClaim(id: string, data: WarrantyClaimDTO, actor?: ActingUser) {
    assertWarrantyModifyAuthority(actor?.role);
    if (!data.description) {
      throw new ValidationError("Claim description is required.");
    }
    const scope = resolveDataScope(actor);
    const existing = await this.repository.findById(id, scopeWhere(scope));
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
      // WTY-01A (Fix 3) — the acting identity now always comes from the
      // authenticated actor, never a client-supplied `claimedBy` string.
      claimedBy: actor?.name || actor?.id || "Authorized User",
    };

    const updated = await this.repository.addClaim(id, existingClaims, newClaim, data.status);
    const [synced] = await this.syncExpiryStatuses([updated]);
    return synced;
  }

  // WTY-01A (Fix 2) — `actor` is optional and used only to scope the
  // manually-triggered path (POST /generate-from-invoice/:invoiceId, exposed
  // to any authenticated user). The automatic call sites in
  // billing.service.ts (invoice create/update) intentionally omit actor —
  // that path already only ever targets the invoice it just created or
  // updated itself, so there is no cross-franchise surface to close there.
  async generateFromInvoice(invoiceId: string, actor?: ScopeActor) {
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

    if (actor) {
      const scope = resolveDataScope(actor);
      if (!scope.unrestricted && (invoice.franchiseId ?? null) !== scope.franchiseId) {
        // 404, not 403 — matches this codebase's established convention of
        // not confirming existence of out-of-scope records to the caller.
        throw new NotFoundError(`Invoice "${invoiceId}" not found in Billing module.`);
      }
    }

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

  // WTY-01A (Fix 5) — now checks the LIVE expiry date, matching
  // updateWarranty/addClaim, instead of only the persisted `status` field.
  // The previous status-only check left a staleness window: a warranty
  // whose expiryDate had already passed, but that hadn't been read via
  // getAllWarranties/getWarrantyById since (the only place status gets
  // lazily synced), could still be deleted.
  // WTY-01C (D-W5, locked) — SUPER_ADMIN/HQ_USER only.
  async deleteWarranty(id: string, actor?: ScopeActor) {
    assertWarrantyModifyAuthority(actor?.role);
    const scope = resolveDataScope(actor);
    const existing = await this.repository.findById(id, scopeWhere(scope));
    if (!existing) throw new NotFoundError("Warranty not found");
    // PRD rule: Expired warranties shall become read-only. History remains permanent.
    if (existing.status === "Expired" || new Date(existing.expiryDate) < new Date()) {
      throw new ValidationError("Expired warranties are read-only and cannot be deleted.");
    }
    await this.repository.softDelete(id);
    return { success: true };
  }
}
