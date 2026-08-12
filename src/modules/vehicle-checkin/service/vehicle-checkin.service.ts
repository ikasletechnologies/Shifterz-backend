import { VehicleCheckinRepository } from '../repository/vehicle-checkin.repository.js';
import type { CreateCheckinDTO, UpdateCheckinDTO, CheckoutDTO } from '../validation/vehicle-checkin.validation.js';
import { generateSequentialId, generateUid } from '../../../shared/utils/idGenerator.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError.js';
import {
  notifyJobAssigned,
  notifyVehicleReady,
  notifyEstimatedDeliveryUpdate,
} from '../../../shared/services/notification.service.js';

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
    const recentEntry = await this.repository.findRecentCheckinByVehicle(data.vehicle, 24);
    if (recentEntry) {
      throw new ValidationError(
        `Vehicle ${data.vehicle} was already checked.`
      );
    }

    const carId = generateUid("CAR");
    const jobCardId = await generateSequentialId("JOB");

    const newCar = await this.repository.create(carId, data, jobCardId, franchiseId);

    // Auto-create Job Card
    const validInTimeISO = safeIsoDate(data.inTime);
    await this.repository.createJobCard({
      id: jobCardId,
      vehicle: data.vehicle,
      customer: data.customer || "",
      service: data.service || "",
      technician: "",
      status: "Pending",
      priority: "",
      startDate: validInTimeISO,
      estCompletion: validInTimeISO,
      notes: (data.notes && data.notes.trim()) ? data.notes.trim() : "Auto-created from check-in",
      franchiseId,
    });

    // Auto-upsert Customer & Vehicle association
    if (data.phone) {
      let customer = await this.repository.findCustomerByPhone(data.phone);
      if (customer) {
        await this.repository.updateCustomerVisits(
          customer.id,
          customer.visits + 1,
          new Date().toISOString()
        );
      } else {
        const custId = await generateSequentialId("CUS");
        customer = await this.repository.createCustomer({
          id: custId,
          name: data.customer || "Walk-in",
          phone: data.phone || "",
          email: "",
          vehicle: data.vehicle || "Unknown",
          model: data.model || "Unknown",
          visits: 1,
          totalSpend: 0,
          lastVisit: new Date().toISOString(),
          franchiseId,
        });
      }

      // Check if vehicle is already linked to the customer, if not create a new CustomerVehicle
      const uppercaseVehicle = data.vehicle.toUpperCase();
      const existingVehicle = await db.customerVehicle.findFirst({
        where: { customerId: customer.id, vehicleNo: uppercaseVehicle, isDeleted: false }
      });
      if (!existingVehicle) {
        await db.customerVehicle.create({
          data: {
            customerId: customer.id,
            vehicleNo: uppercaseVehicle,
            make: data.model ? (data.model.split(' ')[0] || 'Unknown') : 'Unknown',
            model: data.model || 'Unknown',
            odometer: data.odometer ? Number(data.odometer) : 0
          }
        });
      }
    }

    // ── Notification: Job Assigned ──────────────────────────────────────────
    // Fires after job card auto-creation; technician may be assigned later
    notifyJobAssigned({
      franchiseId,
      jobId: jobCardId,
      vehicle: data.vehicle,
      customerName: data.customer || 'Customer',
      technicianId: null,   // assigned later via job card update
      technicianName: null,
    }).catch(console.error);

    return newCar;
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
    if (!job) {
      throw new ValidationError("Associated Job Card not found.");
    }
    const isJobCompleted = job.status === "Completed" || job.status === "QC Passed" || job.status === "Ready For Billing" || job.status === "Delivered" || job.status === "Out" || job.status === "Work Completed";
    if (!isJobCompleted) {
      throw new ValidationError(`Job is not completed. Current status: ${job.status}`);
    }

    // 2. QC Approval Check
    const hasQcPassed = job.passedAt !== null || job.status === "QC Passed" || job.status === "Ready For Billing" || job.status === "Delivered" || job.status === "Out";
    if (!hasQcPassed) {
      throw new ValidationError("Quality Control has not approved/passed this job.");
    }

    // 3. Invoice Generated Check
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

    // 4. Payment Completed or Approved Credit Check
    if (invoice) {
      const payments = await db.payment.findMany({
        where: { invoiceId: invoice.id, isDeleted: false }
      });
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      const invoiceAmount = invoice.amount + invoice.gst - invoice.discount;
      const isCreditApproved = invoice.status === "Approved Credit" || invoice.status === "Paid";
      if (totalPaid < invoiceAmount && !isCreditApproved) {
        throw new ValidationError(`Payment incomplete. Invoiced: ₹${invoiceAmount}, Paid: ₹${totalPaid}. Approved credit is required for outstanding balance.`);
      }
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

  async deleteCheckin(id: string) {
    let car = await this.repository.findById(id);
    if (!car) {
      car = await db.carIn.findFirst({ where: { jobCardId: id, isDeleted: false } });
    }

    if (car) {
      if (car.jobCardId) {
        await this.repository.deleteJobCard(car.jobCardId);
      }
      await this.repository.deleteJobCard(car.id);
      await this.repository.deleteOutpassesByCarInId(car.id);
      await this.repository.delete(car.id);
    } else {
      await this.repository.deleteJobCard(id);
      await this.repository.delete(id);
    }
  }
}
