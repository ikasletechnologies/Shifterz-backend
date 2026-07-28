import { VehicleCheckinRepository } from '../repository/vehicle-checkin.repository.js';
import type { CreateCheckinDTO, UpdateCheckinDTO, CheckoutDTO } from '../validation/vehicle-checkin.validation.js';
import { generateSequentialId, generateUid } from '../../../shared/utils/idGenerator.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';

function safeIsoDate(input?: string | Date | null): string {
  if (!input) return new Date().toISOString();
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export class VehicleCheckinService {
  constructor(private readonly repository: VehicleCheckinRepository = new VehicleCheckinRepository()) { }

  async getAllCheckins() {
    return this.repository.findAll();
  }

  async createCheckin(data: CreateCheckinDTO, franchiseId: string | null) {
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
      priority: "Normal",
      startDate: validInTimeISO,
      estCompletion: validInTimeISO,
      notes: "Auto-created from check-in",
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
