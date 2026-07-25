import { db } from '../../../lib/db.js';
import type { CreateCheckinDTO, UpdateCheckinDTO } from '../validation/vehicle-checkin.validation.js';

function safeIsoDate(input?: string | Date | null): string {
  if (!input) return new Date().toISOString();
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export class VehicleCheckinRepository {
  async findAll() {
    return db.carIn.findMany({
      where: { isDeleted: false },
      orderBy: { inTime: "desc" },
    });
  }

  async findById(id: string) {
    return db.carIn.findFirst({ where: { id, isDeleted: false } });
  }

  async create(id: string, data: CreateCheckinDTO, jobCardId: string, franchiseId: string | null) {
    return db.carIn.create({
      data: {
        id,
        vehicle: data.vehicle,
        model: data.model || "",
        customer: data.customer || "",
        phone: data.phone || "",
        service: data.service || "",
        inTime: safeIsoDate(data.inTime),
        outTime: null,
        status: "In Workshop",
        odometer: String(data.odometer || "0"),
        notes: data.notes || "",
        jobCardId,
        franchiseId,
      },
    });
  }

  async update(id: string, data: UpdateCheckinDTO) {
    return db.carIn.update({
      where: { id },
      data: {
        vehicle: data.vehicle,
        model: data.model,
        customer: data.customer,
        phone: data.phone,
        service: data.service,
        odometer: data.odometer ? String(data.odometer) : undefined,
        notes: data.notes,
      },
    });
  }

  async checkout(id: string, outTime: string) {
    return db.carIn.update({
      where: { id },
      data: { outTime, status: "Delivered" },
    });
  }

  async delete(id: string) {
    return db.carIn.delete({ where: { id } });
  }

  // Related auto-creation methods
  async createJobCard(data: any) {
    return db.job.create({ data });
  }

  async updateJobCard(id: string, data: any) {
    return db.job.update({ where: { id }, data });
  }

  async findCustomerByPhone(phone: string) {
    return db.customer.findFirst({ where: { phone } });
  }

  async updateCustomerVisits(id: string, visits: number, lastVisit: string) {
    return db.customer.update({ where: { id }, data: { visits, lastVisit } });
  }

  async createCustomer(data: any) {
    return db.customer.create({ data });
  }

  async findOutpassByCarInId(carInId: string) {
    return db.outPass.findFirst({ where: { carInId } });
  }

  async createOutpass(data: any) {
    return db.outPass.create({ data });
  }

  async deleteOutpassesByCarInId(carInId: string) {
    return db.outPass.deleteMany({ where: { carInId } });
  }
}
