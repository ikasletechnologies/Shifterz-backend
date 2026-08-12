import { OutpassRepository } from '../repository/outpass.repository.js';
import type { CreateOutpassDTO, UpdateOutpassDTO } from '../validation/outpass.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import { db } from '../../../lib/db.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';

export class OutpassService {
  constructor(private readonly repository: OutpassRepository = new OutpassRepository()) {}

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
    let job: any = null;
    if (data.jobCardId) {
      job = await db.job.findUnique({ where: { id: data.jobCardId } });
    } else if (data.carInId) {
      const carIn = await db.carIn.findUnique({ where: { id: data.carInId } });
      if (carIn && carIn.jobCardId) {
        job = await db.job.findUnique({ where: { id: carIn.jobCardId } });
      }
    } else if (normVeh && normVeh !== "NA") {
      const jobs = await db.job.findMany({
        where: { isDeleted: false },
        orderBy: { createdAt: "desc" },
      });
      job = jobs.find(j => (j.vehicle || "").replace(/[^A-Z0-9]/g, "").toUpperCase() === normVeh) || null;
    }

    // Outpass Verification Rule 1 & 2: Job Completed / QC Passed
    if (job) {
      const statusUpper = (job.status || "").toUpperCase();
      const isJobCompleteOrBilled =
        statusUpper.includes("COMPLETED") ||
        statusUpper.includes("QC") ||
        statusUpper.includes("BILLING") ||
        statusUpper.includes("PAID") ||
        statusUpper.includes("INVOICED") ||
        statusUpper.includes("DELIVERED") ||
        statusUpper.includes("OUT") ||
        job.passedAt !== null;

      if (!isJobCompleteOrBilled) {
        throw new ValidationError(
          `Cannot generate Outpass: Job Card is not completed (current status: "${job.status}").`
        );
      }
    }

    // Outpass Verification Rule 3: Invoice Lookup
    let invoice: any = null;
    if (data.invoiceId) {
      invoice = await db.invoice.findUnique({ where: { id: data.invoiceId } });
    }
    if (!invoice && normVeh && normVeh !== "NA") {
      const invoices = await db.invoice.findMany({
        where: { isDeleted: false, status: { not: "Cancelled" } },
        orderBy: { createdAt: "desc" },
      });
      invoice = invoices.find(inv => (inv.vehicle || "").replace(/[^A-Z0-9]/g, "").toUpperCase() === normVeh) || null;
    }

    // Outpass Verification Rule 4: Payment Completed or Approved Credit
    let isCreditOrPaid = true;
    if (invoice) {
      const payments = await db.payment.findMany({
        where: { invoiceId: invoice.id, isDeleted: false },
      });
      const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const invoiceAmount = (invoice.amount || 0) + (invoice.gst || 0) - (invoice.discount || 0);
      const statusUpper = (invoice.status || "").toUpperCase();
      isCreditOrPaid =
        statusUpper.includes("CREDIT") ||
        statusUpper.includes("PAID") ||
        statusUpper.includes("COMPLETED") ||
        statusUpper.includes("DONE") ||
        (invoiceAmount > 0 && totalPaid >= invoiceAmount - 1) ||
        (totalPaid > 0 && totalPaid >= invoiceAmount);

      if (!isCreditOrPaid) {
        throw new ValidationError(
          `Cannot generate Outpass: Payment incomplete. Invoiced: ₹${invoiceAmount.toFixed(2)}, Paid: ₹${totalPaid.toFixed(2)}.`
        );
      }
    }

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

  async updateOutpass(id: string, data: UpdateOutpassDTO) {
    return this.repository.update(id, data);
  }

  async approveOutpass(id: string, userId: string, userName: string) {
    const updated = await db.outPass.update({
      where: { id },
      data: {
        status: "Approved",
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

  async rejectOutpass(id: string) {
    return db.outPass.update({
      where: { id },
      data: {
        status: "Rejected",
        issued: false,
      }
    });
  }
}
