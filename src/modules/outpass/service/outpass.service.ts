import { OutpassRepository } from '../repository/outpass.repository.js';
import type { CreateOutpassDTO, UpdateOutpassDTO } from '../validation/outpass.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import { db } from '../../../lib/db.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';

export class OutpassService {
  constructor(private readonly repository: OutpassRepository = new OutpassRepository()) {}

  async getAllOutpasses(userRole?: string, franchiseId?: string) {
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
    // 1. Find Job Card for vehicle
    let job: any = null;
    if (data.jobCardId) {
      job = await db.job.findUnique({ where: { id: data.jobCardId } });
    } else if (data.carInId) {
      const carIn = await db.carIn.findUnique({ where: { id: data.carInId } });
      if (carIn && carIn.jobCardId) {
        job = await db.job.findUnique({ where: { id: carIn.jobCardId } });
      }
    } else {
      job = await db.job.findFirst({
        where: { vehicle: data.vehicle, isDeleted: false },
        orderBy: { createdAt: "desc" },
      });
    }

    // Outpass Verification Rule 1: Job Completed
    if (job) {
      const completedStatuses = [
        "Completed",
        "QC Passed",
        "Ready For Billing",
        "Delivered",
        "Out",
        "Work Completed",
      ];
      if (!completedStatuses.includes(job.status)) {
        throw new ValidationError(
          `Cannot generate Outpass: Job Card is not completed (current status: "${job.status}").`
        );
      }

      // Outpass Verification Rule 2: QC Passed
      const hasQcPassed =
        job.passedAt !== null ||
        job.status === "QC Passed" ||
        job.status === "Ready For Billing" ||
        job.status === "Delivered" ||
        job.status === "Out";
      if (!hasQcPassed) {
        throw new ValidationError(
          "Cannot generate Outpass: Quality Control has not approved/passed this job."
        );
      }
    }

    // Outpass Verification Rule 3: Invoice Generated
    const invoice = await db.invoice.findFirst({
      where: {
        vehicle: data.vehicle,
        isDeleted: false,
        status: { not: "Cancelled" },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!invoice) {
      throw new ValidationError(
        "Cannot generate Outpass: No active invoice has been generated for this vehicle."
      );
    }

    // Outpass Verification Rule 4: Payment Completed or Approved Credit
    const payments = await db.payment.findMany({
      where: { invoiceId: invoice.id, isDeleted: false },
    });
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const invoiceAmount = invoice.amount + invoice.gst - invoice.discount;
    const isCreditApproved =
      invoice.status === "Approved Credit" || invoice.status === "Paid";
    if (totalPaid < invoiceAmount && !isCreditApproved) {
      throw new ValidationError(
        `Cannot generate Outpass: Payment incomplete. Invoiced: ₹${invoiceAmount.toFixed(2)}, Paid: ₹${totalPaid.toFixed(2)}. Approved credit is required for outstanding balance.`
      );
    }

    // Outpass Verification Rule 5: Customer Confirmation
    if (data.customerConfirmation === false) {
      throw new ValidationError(
        "Cannot generate Outpass: Customer confirmation is required."
      );
    }

    const passId = generateUid("OP");
    const paymentStatusStr =
      invoice.status === "Approved Credit"
        ? "Approved Credit"
        : totalPaid >= invoiceAmount
          ? "Paid"
          : "Pending";

    const newOutpass = await this.repository.create(passId, {
      ...data,
      jobCardId: job?.id || null,
      invoiceId: invoice.id,
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
              vehicle: data.vehicle,
              invoiceId: invoice.id,
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
      await db.jobHistory.create({
        data: {
          jobId: updated.jobCardId,
          event: "OUTPASS_APPROVED",
          performedBy: userId || "SYSTEM",
          payload: {
            outpassId: updated.id,
            vehicle: updated.vehicle,
            approvedBy: userName || userId || "SYSTEM",
          },
        }
      }).catch(() => null);
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

