import { VehicleCheckinRepository } from '../repository/vehicle-checkin.repository.js';
import type { CreateCheckinDTO, UpdateCheckinDTO, CheckoutDTO } from '../validation/vehicle-checkin.validation.js';
import { generateSequentialId, generateUid } from '../../../shared/utils/idGenerator.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';

function safeIsoDate(input?: string | Date | null): string {
  if (!input) return new Date().toISOString();
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

import { db } from '../../../lib/db.js';

export class VehicleCheckinService {
  constructor(private readonly repository: VehicleCheckinRepository = new VehicleCheckinRepository()) { }

  async getAllCheckins() {
    const checkins = await this.repository.findAll();
    const jobCardIds = checkins.map((c) => c.jobCardId).filter(Boolean);
    const jobs = await db.job.findMany({
      where: { id: { in: jobCardIds } },
      select: { id: true, technician: true },
    });
    const jobMap = new Map(jobs.map((j) => [j.id, j.technician]));

    return checkins.map((c) => ({
      ...c,
      entryId: c.id,
      technician: jobMap.get(c.jobCardId) || "",
    }));
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
      estCompletion: "",
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
    await this.repository.deleteOutpassesByCarInId(id);
    await this.repository.delete(id);
  }
}
