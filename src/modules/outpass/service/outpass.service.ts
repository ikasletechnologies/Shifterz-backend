import { OutpassRepository } from '../repository/outpass.repository.js';
import type { CreateOutpassDTO, UpdateOutpassDTO } from '../validation/outpass.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import { db } from '../../../lib/db.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { resolveDataScope, scopeWhere, type ScopeActor } from '../../../shared/scope/dataScope.js';
import { assertJobQcPassed, assertInvoicePaidOrCredit } from './deliveryGate.helper.js';

export class OutpassService {
  constructor(private readonly repository: OutpassRepository = new OutpassRepository()) {}

  private async resolveJobForOutpass(
    jobCardId: string | null | undefined,
    carInId: string | null | undefined,
    normVeh: string
  ) {
    if (jobCardId) {
      return db.job.findUnique({ where: { id: jobCardId } });
    }
    if (carInId) {
      const carIn = await db.carIn.findUnique({ where: { id: carInId } });
      if (carIn && carIn.jobCardId) {
        return db.job.findUnique({ where: { id: carIn.jobCardId } });
      }
      return null;
    }
    if (normVeh && normVeh !== "NA") {
      const jobs = await db.job.findMany({
        where: { isDeleted: false },
        orderBy: { createdAt: "desc" },
      });
      return jobs.find(j => (j.vehicle || "").replace(/[^A-Z0-9]/g, "").toUpperCase() === normVeh) || null;
    }
    return null;
  }

  private async resolveInvoiceForOutpass(invoiceId: string | null | undefined, normVeh: string) {
    if (invoiceId) {
      const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
      if (invoice) return invoice;
    }
    if (normVeh && normVeh !== "NA") {
      const invoices = await db.invoice.findMany({
        where: { isDeleted: false, status: { not: "Cancelled" } },
        orderBy: { createdAt: "desc" },
      });
      return invoices.find(inv => (inv.vehicle || "").replace(/[^A-Z0-9]/g, "").toUpperCase() === normVeh) || null;
    }
    return null;
  }

  // EPB 2.10 — single authoritative delivery gate, backed by the pure checks
  // in deliveryGate.helper.ts. Called at both createOutpass (request time)
  // and approveOutpass (release time, against fresh state) so neither path
  // can skip it.
  private async assertDeliveryPrerequisites(job: any, invoice: any): Promise<void> {
    assertJobQcPassed(job);

    const totalPaid = invoice
      ? (await db.payment.findMany({ where: { invoiceId: invoice.id, isDeleted: false } }))
          .reduce((sum, p) => sum + Number(p.amount || 0), 0)
      : 0;
    assertInvoicePaidOrCredit(invoice, totalPaid);
  }

  async getAllOutpasses(userRole?: string, franchiseId?: string) {
    // Deduplicate any existing duplicate OutPass records (same invoiceId or same normalized vehicle)
    try {
      const activePasses = await db.outPass.findMany({
        where: { isDeleted: false },
        orderBy: { outTime: "desc" },
      });

      const seenInvoices = new Set<string>();
      const seenVehicles = new Set<string>();

      for (const pass of activePasses) {
        const normVeh = (pass.vehicle || "").replace(/[^A-Z0-9]/g, "").toUpperCase();
        let isDuplicate = false;

        if (pass.invoiceId) {
          if (seenInvoices.has(pass.invoiceId)) {
            isDuplicate = true;
          } else {
            seenInvoices.add(pass.invoiceId);
          }
        }

        if (!isDuplicate && normVeh && normVeh !== "NA" && normVeh !== "N/A") {
          if (seenVehicles.has(normVeh)) {
            isDuplicate = true;
          } else {
            seenVehicles.add(normVeh);
          }
        }

        if (isDuplicate) {
          await db.outPass.update({
            where: { id: pass.id },
            data: { isDeleted: true },
          });
        }
      }
    } catch (cleanErr) {
      console.error("Deduplication cleanup error:", cleanErr);
    }



    const conditions: any = { isDeleted: false };
    if (userRole && userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER" && franchiseId) {
      conditions.franchiseId = franchiseId;
    }
    return db.outPass.findMany({
      where: conditions,
      orderBy: { outTime: "desc" }
    });
  }

  async createOutpass(
    data: CreateOutpassDTO,
    franchiseId: string | null = null,
    userId?: string,
    userName?: string
  ) {
    const inputVeh = data.vehicle && data.vehicle !== "-" ? data.vehicle : "";
    const normVeh = inputVeh.replace(/[^A-Z0-9]/g, "").toUpperCase();

    // Check for existing active outpass by invoiceId, jobCardId, or normalized vehicle number
    const existingOutpasses = await db.outPass.findMany({
      where: { isDeleted: false },
    });

    const existing = existingOutpasses.find((op) => {
      if (data.invoiceId && op.invoiceId === data.invoiceId) return true;
      if (data.jobCardId && op.jobCardId === data.jobCardId) return true;
      if (normVeh && normVeh !== "NA" && normVeh !== "N/A") {
        const opNormVeh = (op.vehicle || "").replace(/[^A-Z0-9]/g, "").toUpperCase();
        if (opNormVeh === normVeh) return true;
      }
      return false;
    });

    if (existing) {
      return existing;
    }

    // 1. Find Job Card for vehicle
    const job = await this.resolveJobForOutpass(data.jobCardId, data.carInId, normVeh);

    // 2. Find Invoice for vehicle
    const invoice = await this.resolveInvoiceForOutpass(data.invoiceId, normVeh);

    // Outpass Verification Rules 1-4: Job found + QC Passed + Invoice exists
    // + Payment complete/approved credit. EPB 2.10 — a vehicle may only be
    // released once ALL of these hold; this is the sole authoritative gate
    // and is re-run again in approveOutpass() immediately before checkout.
    await this.assertDeliveryPrerequisites(job, invoice);

    // Outpass Verification Rule 5: Customer Confirmation
    if (data.customerConfirmation === false) {
      throw new ValidationError(
        "Cannot generate Outpass: Customer confirmation is required."
      );
    }

    const passId = generateUid("OP");
    const statusUpper = (invoice?.status || "").toUpperCase();
    const paymentStatusStr =
      statusUpper.includes("CREDIT")
        ? "Approved Credit"
        : "Paid";

    const vehicleVal = data.vehicle && data.vehicle !== "-" ? data.vehicle : (invoice?.vehicle && invoice.vehicle !== "-" ? invoice.vehicle : "N/A");
    const customerVal = data.customer || invoice?.client || "Walk-in Customer";
    const phoneVal = data.phone || invoice?.phone || "";
    const serviceVal = data.service || invoice?.service || "General Service";

    const newOutpass = await this.repository.create(passId, {
      ...data,
      vehicle: vehicleVal,
      customer: customerVal,
      phone: phoneVal,
      service: serviceVal,
      jobCardId: job?.id || null,
      invoiceId: invoice?.id || null,
      paymentStatus: paymentStatusStr,
      createdBy: userName || userId || null,
      status: "Pending",
      issued: false,
      franchiseId,
    });

    if (job?.id) {
      await db.jobHistory
        .create({
          data: {
            jobId: job.id,
            event: "OUTPASS_GENERATED",
            performedBy: userId || "SYSTEM",
            payload: {
              outpassId: passId,
              vehicle: vehicleVal,
              invoiceId: invoice?.id || null,
              paymentStatus: paymentStatusStr,
              generatedBy: userName || userId || "SYSTEM",
            },
          },
        })
        .catch(() => null);
    }

    return newOutpass;
  }

  async updateOutpass(id: string, data: UpdateOutpassDTO, actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    const existing = await this.repository.findById(id, scopeWhere(scope));
    if (!existing) {
      throw new NotFoundError("Outpass not found");
    }
    if (existing.status === "Delivered" || existing.status === "Approved") {
      throw new ValidationError("Approved/Delivered outpasses must not be editable.");
    }
    if (existing.status !== "Rejected") {
      throw new ValidationError("Edit functionality is available only for Rejected records.");
    }

    const enriched = {
      ...data,
      status: "Updated",
    };
    return this.repository.update(id, enriched);
  }

  async approveOutpass(id: string, userId: string, userName: string, actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    const existing = await this.repository.findById(id, scopeWhere(scope));
    if (!existing) throw new NotFoundError("Outpass not found");

    // Re-run the full delivery gate against CURRENT state immediately before
    // release. createOutpass's checks are only a snapshot at request time —
    // this is the actual checkout moment, so it must not trust that nothing
    // changed (or was wrong) since then.
    const normVeh = (existing.vehicle || "").replace(/[^A-Z0-9]/g, "").toUpperCase();
    const job = existing.jobCardId
      ? await db.job.findUnique({ where: { id: existing.jobCardId } })
      : await this.resolveJobForOutpass(null, existing.carInId || null, normVeh);
    const invoice = await this.resolveInvoiceForOutpass(existing.invoiceId, normVeh);
    await this.assertDeliveryPrerequisites(job, invoice);

    const updated = await db.outPass.update({
      where: { id },
      data: {
        status: "Delivered",
        issued: true,
        approvedBy: userId,
        approvedAt: new Date(),
      }
    });

    if (updated.jobCardId) {
      await db.job.update({
        where: { id: updated.jobCardId },
        data: { status: "Delivered", actualCompletion: new Date() }
      }).catch(() => null);

      await db.jobHistory.create({
        data: {
          jobId: updated.jobCardId,
          event: "VEHICLE_DELIVERED",
          performedBy: userId || "SYSTEM",
          payload: {
            outpassId: updated.id,
            vehicle: updated.vehicle,
            approvedBy: userName || userId || "SYSTEM",
          },
        }
      }).catch(() => null);
    }

    if (updated.vehicle && updated.vehicle !== "N/A" && updated.vehicle !== "-") {
      const normVeh = updated.vehicle.replace(/[^A-Z0-9]/g, "").toUpperCase();
      const allCarIns = await db.carIn.findMany({
        where: { status: { not: "Out" } }
      });
      const matchingCarIns = allCarIns.filter(c => (c.vehicle || "").replace(/[^A-Z0-9]/g, "").toUpperCase() === normVeh);
      for (const c of matchingCarIns) {
        await db.carIn.update({
          where: { id: c.id },
          data: { status: "Out", outTime: new Date() }
        }).catch(() => null);
      }
    }

    return updated;
  }

  async rejectOutpass(id: string, actor?: ScopeActor) {
    const scope = resolveDataScope(actor);
    const existing = await this.repository.findById(id, scopeWhere(scope));
    if (!existing) throw new NotFoundError("Outpass not found");

    return db.outPass.update({
      where: { id },
      data: {
        status: "Rejected",
        issued: false,
      }
    });
  }
}
