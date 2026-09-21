import { VehicleCheckinRepository } from '../repository/vehicle-checkin.repository.js';
import type { CreateCheckinDTO, UpdateCheckinDTO, CheckoutDTO } from '../validation/vehicle-checkin.validation.js';
import { generateSequentialId, generateUid } from '../../../shared/utils/idGenerator.js';
import { normalizeVehicleNo } from '../../../shared/utils/vehicleUtils.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError.js';
import {
  notifyJobAssigned,
  notifyVehicleReady,
  notifyEstimatedDeliveryUpdate,
} from '../../../shared/services/notification.service.js';
// EPB 2.10 — the same authoritative job/QC/invoice/payment gate outpass.service.ts
// uses, so this checkout path and outpass approval can never independently
// drift into two different rule sets for "may this vehicle leave."
import { assertJobQcPassed, assertInvoicePaidOrCredit } from '../../outpass/service/deliveryGate.helper.js';
import { COMPLETED_JOB_STATUSES } from '../../../shared/constants/jobStatus.constants.js';

function safeIsoDate(input?: string | Date | null): string {
  if (!input) return new Date().toISOString();
  if (typeof input === 'string' && !input.trim()) return new Date().toISOString();
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

import { db } from '../../../lib/db.js';

export class VehicleCheckinService {
  constructor(private readonly repository: VehicleCheckinRepository = new VehicleCheckinRepository()) { }

  async checkTechnicianAccess(checkinId: string, user?: { id?: string; name?: string; role?: string }) {
    if (!user) return;
    const userRole = (user.role || "").toUpperCase().replace(/[\s_]+/g, "_");
    if (userRole !== "TECHNICIAN") return;

    const car = await this.repository.findById(checkinId);
    if (!car) throw new NotFoundError("Car entry not found");

    if (!car.jobCardId) {
      throw new ForbiddenError("You do not have permission to access this vehicle");
    }

    const job = await db.job.findUnique({
      where: { id: car.jobCardId },
      select: { technician: true, technicianId: true },
    });

    const userId = user.id;
    const userName = user.name ? user.name.trim().toLowerCase() : "";

    const techIdMatch = Boolean(userId && job?.technicianId === userId);
    const techNameMatch = Boolean(
      userName &&
      job?.technician &&
      job.technician.trim().toLowerCase() === userName &&
      job.technician.trim().toLowerCase() !== "unassigned"
    );

    if (!techIdMatch && !techNameMatch) {
      throw new ForbiddenError("You do not have permission to access or modify this vehicle");
    }
  }

  // EPB 2.6/2.4 — a franchise (or HQ-controlled) user may only delete a
  // check-in that belongs to their own franchise. HQ (SUPER_ADMIN/HQ_USER)
  // retains unrestricted access, matching the tenant() middleware's scope
  // resolution elsewhere. Mirrors checkTechnicianAccess's id-or-jobCardId
  // lookup so a legitimate delete-by-job-card-id request isn't rejected.
  async assertFranchiseAccess(checkinId: string, user?: { role?: string; franchiseId?: string | null }) {
    if (!user) return;
    const userRole = (user.role || "").toUpperCase().replace(/[\s_]+/g, "_");
    if (userRole === "SUPER_ADMIN" || userRole === "HQ_USER") return;

    let car = await this.repository.findById(checkinId);
    if (!car) {
      car = await db.carIn.findFirst({ where: { jobCardId: checkinId, isDeleted: false } });
    }
    if (!car) throw new NotFoundError("Car entry not found");

    const requiredFranchiseId = user.franchiseId ?? null;
    if (car.franchiseId !== requiredFranchiseId) {
      throw new ForbiddenError("You do not have permission to access this vehicle");
    }
  }

  async getAllCheckins(user?: { id?: string; name?: string; role?: string; franchiseId?: string | null }) {
    const userRole = user ? (user.role || "").toUpperCase().replace(/[\s_]+/g, "_") : "";
    const isHQ = userRole === "SUPER_ADMIN" || userRole === "HQ_USER";
    const scopeFranchiseId = user && !isHQ ? user.franchiseId : undefined;

    const checkins = await this.repository.findAll(scopeFranchiseId);
    const jobCardIds = checkins.map((c) => c.jobCardId).filter(Boolean);
    const jobs = await db.job.findMany({
      where: { id: { in: jobCardIds } },
      select: { id: true, technician: true, technicianId: true, status: true },
    });
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const checkinsWithTech = checkins.map((c) => {
      const job = jobMap.get(c.jobCardId);
      return {
        ...c,
        entryId: c.id,
        technician: job?.technician || "",
        technicianId: job?.technicianId || null,
        technicianStatus: job?.status || "",
        jobStatus: job?.status || "",
      };
    });

    if (user) {
      if (userRole === "TECHNICIAN") {
        const userId = user.id;
        const userName = user.name ? user.name.trim().toLowerCase() : "";

        return checkinsWithTech.filter((c) => {
          const job = jobMap.get(c.jobCardId);
          if (!job) return false;

          const techIdMatch = Boolean(userId && job.technicianId === userId);
          const techNameMatch = Boolean(
            userName &&
            job.technician &&
            job.technician.trim().toLowerCase() === userName &&
            job.technician.trim().toLowerCase() !== "unassigned"
          );

          return techIdMatch || techNameMatch;
        });
      }
    }

    return checkinsWithTech;
  }

  async createCheckin(data: CreateCheckinDTO, franchiseId: string | null) {
    const normVehicle = normalizeVehicleNo(data.vehicle);

    const recentEntry = await this.repository.findRecentCheckinByVehicle(normVehicle, 24);
    if (recentEntry) {
      throw new ValidationError(
        `Vehicle ${normVehicle} was already checked.`
      );
    }

    const carId = generateUid("CAR");
    const jobCardId = await generateSequentialId("JOB");

    return db.$transaction(async (tx) => {
      const validInTimeISO = safeIsoDate(data.inTime);

      const checkinData = {
        ...data,
        vehicle: normVehicle,
      };

      const newCar = await tx.carIn.create({
        data: {
          id: carId,
          vehicle: normVehicle,
          model: checkinData.model || "",
          customer: checkinData.customer || "",
          phone: checkinData.phone || "",
          service: checkinData.service || "",
          inTime: validInTimeISO,
          status: (checkinData as any).status || "Pending",
          odometer: String(checkinData.odometer || "0"),
          notes: checkinData.notes || "",
          jobCardId,
          franchiseId,
          receivedById: checkinData.receivedById || null,
          receivedByName: checkinData.receivedByName || null,
          fuelLevel: checkinData.fuelLevel || null,
          keyCount: checkinData.keyCount ? Number(checkinData.keyCount) : 1,
          expectedDelivery: checkinData.expectedDelivery ? safeIsoDate(checkinData.expectedDelivery) : null,
          scratches: checkinData.scratches || null,
          dents: checkinData.dents || null,
          brokenParts: checkinData.brokenParts || null,
          glassDamage: checkinData.glassDamage || null,
          wheelDamage: checkinData.wheelDamage || null,
          interiorCondition: checkinData.interiorCondition || null,
          accessoriesReceived: checkinData.accessoriesReceived || null,
          remarks: checkinData.remarks || null,
          photoFront: checkinData.photoFront || null,
          photoRear: checkinData.photoRear || null,
          photoLeft: checkinData.photoLeft || null,
          photoRight: checkinData.photoRight || null,
          photoDashboard: checkinData.photoDashboard || null,
          photoOdometer: checkinData.photoOdometer || null,
          photoDamages: checkinData.photoDamages || [],
          hasSpareWheel: Boolean(checkinData.hasSpareWheel),
          hasJack: Boolean(checkinData.hasJack),
          hasToolkit: Boolean(checkinData.hasToolkit),
          hasFloorMats: Boolean(checkinData.hasFloorMats),
          hasFastag: Boolean(checkinData.hasFastag),
          hasDashCam: Boolean(checkinData.hasDashCam),
          hasUsbCharger: Boolean(checkinData.hasUsbCharger),
          otherAccessories: checkinData.otherAccessories || null,
        }
      });

      // Auto-create Job Card
      await tx.job.create({
        data: {
          id: jobCardId,
          vehicle: normVehicle,
          customer: checkinData.customer || "",
          service: checkinData.service || "",
          technician: "",
          status: "Pending",
          priority: "Medium",
          startDate: validInTimeISO,
          estCompletion: validInTimeISO,
          notes: (checkinData.notes && checkinData.notes.trim()) ? checkinData.notes.trim() : "Auto-created from check-in",
          franchiseId,
          carInId: carId,
        }
      });

      // Write CREATED history record so getJobHistory always finds this event
      await tx.jobHistory.create({
        data: {
          jobId: jobCardId,
          event: 'CREATED',
          performedBy: 'SYSTEM',
          payload: {
            vehicle: normVehicle,
            customer: checkinData.customer || "",
            source: 'vehicle-checkin',
          },
        },
      });

      // Auto-upsert Customer & Vehicle association
      if (checkinData.phone) {
        let customer = await tx.customer.findFirst({
          where: { phone: checkinData.phone }
        });

        if (customer) {
          customer = await tx.customer.update({
            where: { id: customer.id },
            data: {
              visits: customer.visits + 1,
              lastVisit: new Date(),
              isDeleted: false,
              deletedAt: null
            }
          });
        } else {
          const custId = await generateSequentialId("CUS");
          customer = await tx.customer.create({
            data: {
              id: custId,
              name: checkinData.customer || "Walk-in",
              phone: checkinData.phone || "",
              email: "",
              vehicle: normVehicle,
              model: checkinData.model || "Unknown",
              visits: 1,
              totalSpend: 0,
              lastVisit: new Date(),
              franchiseId,
            }
          });
        }

        // Check if vehicle is already in CustomerVehicle master
        const existingVehicle = await tx.customerVehicle.findFirst({
          where: { vehicleNo: normVehicle }
        });

        const checkinOdometerNum = parseInt(String(checkinData.odometer || "0"), 10);

        if (!existingVehicle) {
          await tx.customerVehicle.create({
            data: {
              customerId: customer.id,
              vehicleNo: normVehicle,
              make: checkinData.model ? (checkinData.model.split(' ')[0] || 'Unknown') : 'Unknown',
              model: checkinData.model || 'Unknown',
              odometer: !isNaN(checkinOdometerNum) ? checkinOdometerNum : 0
            }
          });
        } else {
          // Odometer Authority: advance odometer ONLY if new reading is greater than current
          const currentOdometer = existingVehicle.odometer || 0;
          const shouldUpdateOdometer = !isNaN(checkinOdometerNum) && checkinOdometerNum > currentOdometer;

          await tx.customerVehicle.update({
            where: { id: existingVehicle.id },
            data: {
              customerId: customer.id, // Ensure ownership re-linked if visiting under this customer
              isDeleted: false,
              deletedAt: null,
              odometer: shouldUpdateOdometer ? checkinOdometerNum : existingVehicle.odometer
            }
          });
        }
      }

      notifyJobAssigned({
        franchiseId,
        jobId: jobCardId,
        vehicle: normVehicle,
        customerName: checkinData.customer || 'Customer',
        technicianId: null,
        technicianName: null,
      }).catch(console.error);

      return newCar;
    });
  }

  async updateCheckin(id: string, data: UpdateCheckinDTO) {
    const updated = await this.repository.update(id, data);

    if (updated.jobCardId) {
      await this.repository.updateJobCard(updated.jobCardId, {
        vehicle: data.vehicle,
        customer: data.customer,
        service: data.service,
        notes: data.notes,
      });
    }

    return updated;
  }

  // EPB 2.10 (UI-1) — read-only breakdown of the same 5 delivery
  // conditions checkout() enforces, so the UI can show a live checklist
  // ("Job Completed / QC Passed / Invoice Generated / Payment or Credit /
  // Outpass Approved") without re-deriving the rule itself. `canCheckout`/
  // `blockingReasons` are built by calling the exact same assert functions
  // checkout() calls — catching what they throw rather than recomputing the
  // pass/fail logic a second time — so this can never silently diverge from
  // what checkout() will actually allow. The individual boolean fields
  // (jobComplete, qcPassed, ...) are informational detail for the checklist
  // UI only.
  async getDeliveryReadiness(id: string) {
    const car = await this.repository.findById(id);
    if (!car) {
      throw new NotFoundError("Car entry not found");
    }

    const job = car.jobCardId ? await db.job.findUnique({ where: { id: car.jobCardId } }) : null;

    let invoice = await db.invoice.findFirst({
      where: { vehicle: car.vehicle, isDeleted: false, status: { not: "Cancelled" } },
      orderBy: { createdAt: "desc" }
    });
    if (!invoice && car.jobCardId) {
      invoice = await db.invoice.findFirst({
        where: { jobId: car.jobCardId, isDeleted: false, status: { not: "Cancelled" } },
        orderBy: { createdAt: "desc" }
      });
    }

    const payments = invoice
      ? await db.payment.findMany({ where: { invoiceId: invoice.id, isDeleted: false } })
      : [];
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const invoiceAmount = invoice ? (invoice.amount || 0) + (invoice.gst || 0) - (invoice.discount || 0) : 0;

    const outpass = await db.outPass.findFirst({
      where: {
        isDeleted: false,
        OR: [{ carInId: car.id }, ...(car.jobCardId ? [{ jobCardId: car.jobCardId }] : [])],
      },
      orderBy: { outTime: "desc" },
    });

    const jobComplete = !!job && COMPLETED_JOB_STATUSES.includes(job.status);
    const qcPassed = !!job?.passedAt;
    const invoiceGenerated = !!invoice;
    const paymentComplete =
      !!invoice &&
      (invoice.status === "Approved Credit" ||
        invoice.status === "Paid" ||
        (invoiceAmount > 0 && totalPaid >= invoiceAmount - 1));
    const outpassApproved = !!outpass && outpass.status === "Delivered" && !!outpass.issued;

    const blockingReasons: string[] = [];
    try {
      assertJobQcPassed(job, "check out");
    } catch (e: any) {
      blockingReasons.push(e.message);
    }
    try {
      assertInvoicePaidOrCredit(invoice, totalPaid, "check out");
    } catch (e: any) {
      blockingReasons.push(e.message);
    }
    if (!outpassApproved) {
      blockingReasons.push(
        `Cannot check out this vehicle: no approved Outpass exists (current outpass status: "${outpass?.status ?? "none"}").`
      );
    }

    return {
      conditions: { jobComplete, qcPassed, invoiceGenerated, paymentComplete, outpassApproved },
      details: {
        jobStatus: job?.status ?? null,
        invoiceId: invoice?.id ?? null,
        invoiceStatus: invoice?.status ?? null,
        invoiceAmount: invoice ? invoiceAmount : null,
        totalPaid: invoice ? totalPaid : null,
        outpassId: outpass?.id ?? null,
        outpassStatus: outpass?.status ?? null,
      },
      canCheckout: blockingReasons.length === 0,
      blockingReasons,
    };
  }

  async checkout(id: string, data: CheckoutDTO) {
    const now = new Date().toISOString();
    const car = await this.repository.findById(id);
    if (!car) {
      throw new NotFoundError("Car entry not found");
    }

    // 1. Job Card Validation
    if (!car.jobCardId) {
      throw new ValidationError("No Job Card associated with this check-in.");
    }
    const job = await db.job.findUnique({ where: { id: car.jobCardId } });

    // 2. Job complete + QC actually passed (job.passedAt is the sole
    // authoritative signal — see deliveryGate.helper.ts).
    assertJobQcPassed(job, "check out");

    // 3. Invoice Generated Check — EPB 2.10 re-verification finding: for a
    // repeat vehicle (same registration serviced on a prior, already-paid
    // visit), resolving by vehicle string FIRST could match that older,
    // unrelated invoice instead of failing when the CURRENT job hasn't been
    // billed yet — silently satisfying the payment gate with stale data.
    // car.jobCardId is a direct, reliable reference to THIS check-in's own
    // job (set at check-in time), and Invoice.jobId is populated at billing
    // time (see billing.service.ts's createInvoice), so it is the correct,
    // specific identifier to try first.
    //
    // The vehicle-string fallback below is deliberately scoped to
    // `jobId: null` — it exists ONLY to find genuinely legacy invoices that
    // predate Invoice.jobId being populated (an optional/nullable field).
    // It must never match an invoice that IS linked to a different job:
    // that would still let an already-settled prior visit's invoice
    // satisfy the current, unbilled visit's payment gate, just through a
    // narrower door. If no job-linked invoice exists and no unlinked
    // legacy invoice exists either, `invoice` stays null and the check
    // below correctly fails with "no Invoice found" rather than
    // substituting unrelated data.
    let invoice = await db.invoice.findFirst({
      where: { jobId: car.jobCardId, isDeleted: false, status: { not: "Cancelled" } },
      orderBy: { createdAt: "desc" }
    });
    if (!invoice) {
      invoice = await db.invoice.findFirst({
        where: { vehicle: car.vehicle, jobId: null, isDeleted: false, status: { not: "Cancelled" } },
        orderBy: { createdAt: "desc" }
      });
    }

    // 4. Payment Completed or Approved Credit Check
    const payments = invoice
      ? await db.payment.findMany({ where: { invoiceId: invoice.id, isDeleted: false } })
      : [];
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    assertInvoicePaidOrCredit(invoice, totalPaid, "check out");

    // 5. Outpass Generated + Approved Check — EPB 2.10's fifth condition.
    // This was previously missing entirely: a vehicle could be checked out
    // here without an OutPass ever being created or approved, bypassing the
    // one check that IS enforced on the separate /outpass/:id/approve path.
    // "Delivered" is OutPass's actual on-approval status value (set by
    // OutpassService.approveOutpass), matching by carInId or jobCardId.
    const outpass = await db.outPass.findFirst({
      where: {
        isDeleted: false,
        OR: [{ carInId: car.id }, ...(car.jobCardId ? [{ jobCardId: car.jobCardId }] : [])],
      },
      orderBy: { outTime: "desc" },
    });
    if (!outpass || outpass.status !== "Delivered" || !outpass.issued) {
      throw new ValidationError(
        `Cannot check out: no approved Outpass exists for this vehicle (current outpass status: "${outpass?.status ?? "none"}"). Generate and approve an Outpass first.`
      );
    }


    const updatedCar = await this.repository.checkout(id, now, {
      deliveredById: data.deliveredById,
      deliveredByName: data.deliveredByName,
      customerAcknowledgement: data.customerAcknowledgement,
    });

    // Auto-deliver Job Card when vehicle is checked out in Car In/Out workflow
    await this.repository.updateJobCard(car.jobCardId, {
      status: "Delivered",
      estCompletion: now,
      actualCompletion: now,
    });

    // ── Job Card Timeline: VEHICLE_DELIVERED ──────────────────────────────
    await db.jobHistory.create({
      data: {
        jobId: car.jobCardId,
        event: "VEHICLE_DELIVERED",
        performedBy: data.deliveredById || "SYSTEM",
        payload: {
          checkOutAt: now,
          deliveredByName: data.deliveredByName || null,
          customerAcknowledgement: data.customerAcknowledgement || null,
          vehicle: car.vehicle,
          customer: car.customer,
        },
      },
    }).catch(() => null);

    // ── Notification: Vehicle Ready / Delivered ────────────────────────────
    const customer = car.phone
      ? await db.customer.findFirst({ where: { phone: car.phone, isDeleted: false }, select: { name: true, phone: true, email: true } }).catch(() => null)
      : null;
    notifyVehicleReady({
      franchiseId: car.franchiseId,
      customerName: customer?.name || car.customer,
      customerPhone: customer?.phone || car.phone,
      customerEmail: customer?.email,
      vehicle: car.vehicle,
      jobCardId: car.jobCardId,
    }).catch(console.error);

    return updatedCar;
  }

  // EPB 2.13/17.7 — returns a pre-delete snapshot (car, job, linked
  // outpasses) so the caller can write an audit entry with a real
  // "Previous Value" instead of null.
  async deleteCheckin(id: string) {
    let car = await this.repository.findById(id);
    if (!car) {
      car = await db.carIn.findFirst({ where: { jobCardId: id, isDeleted: false } });
    }

    if (car) {
      const job = car.jobCardId ? await db.job.findFirst({ where: { id: car.jobCardId } }) : null;
      const outpasses = await db.outPass.findMany({ where: { carInId: car.id, isDeleted: false } });
      const snapshot = { car, job, outpasses };

      if (car.jobCardId) {
        await this.repository.deleteJobCard(car.jobCardId);
      }
      await this.repository.deleteJobCard(car.id);
      await this.repository.deleteOutpassesByCarInId(car.id);
      await this.repository.delete(car.id);
      return snapshot;
    } else {
      const job = await db.job.findFirst({ where: { id } });
      await this.repository.deleteJobCard(id);
      await this.repository.delete(id);
      return { car: null, job, outpasses: [] };
    }
  }
}
