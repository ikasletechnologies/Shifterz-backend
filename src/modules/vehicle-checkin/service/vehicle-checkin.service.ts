import { VehicleCheckinRepository } from '../repository/vehicle-checkin.repository.js';
import type { CreateCheckinDTO, UpdateCheckinDTO, CheckoutDTO } from '../validation/vehicle-checkin.validation.js';
import { generateSequentialId, generateUid } from '../../../shared/utils/idGenerator.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError.js';

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

  async getAllCheckins(user?: { id?: string; name?: string; role?: string }) {
    const checkins = await this.repository.findAll();
    const jobCardIds = checkins.map((c) => c.jobCardId).filter(Boolean);
    const jobs = await db.job.findMany({
      where: { id: { in: jobCardIds } },
      select: { id: true, technician: true, technicianId: true },
    });
    const jobMap = new Map(jobs.map((j) => [j.id, j]));

    const checkinsWithTech = checkins.map((c) => {
      const job = jobMap.get(c.jobCardId);
      return {
        ...c,
        entryId: c.id,
        technician: job?.technician || "",
        technicianId: job?.technicianId || null,
      };
    });

    if (user) {
      const userRole = (user.role || "").toUpperCase().replace(/[\s_]+/g, "_");
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

    // Auto-upsert Customer
    if (data.phone) {
      const existingCust = await this.repository.findCustomerByPhone(data.phone);
      if (existingCust) {
        await this.repository.updateCustomerVisits(
          existingCust.id,
          existingCust.visits + 1,
          new Date().toISOString()
        );
      } else {
        const custId = await generateSequentialId("CUS");
        await this.repository.createCustomer({
          id: custId,
          name: data.customer || "Walk-in",
          phone: data.phone || "",
          email: "",
          vehicle: data.vehicle,
          model: data.model || "",
          visits: 1,
          totalSpend: 0,
          lastVisit: new Date().toISOString(),
          franchiseId,
        });
      }
    }

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

    const updatedCar = await this.repository.checkout(id, now);

    // Auto-complete Job Card
    if (car.jobCardId) {
      await this.repository.updateJobCard(car.jobCardId, {
        status: "Completed",
        estCompletion: now,
      });
    }

    // Auto-create OutPass
    const existPass = await this.repository.findOutpassByCarInId(id);
    if (!existPass) {
      const opId = generateUid("OP");
      await this.repository.createOutpass({
        id: opId,
        vehicle: car.vehicle,
        model: car.model,
        customer: car.customer,
        phone: car.phone,
        service: car.service,
        outTime: now,
        securityName: data.securityName || "N/A",
        technicianName: "",
        remarks: "Washed and checked out successfully.",
        issued: true,
        carInId: id,
      });
    }

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
