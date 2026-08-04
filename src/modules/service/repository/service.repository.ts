import { db } from '../../../lib/db.js';
import type { CreateServiceDTO, UpdateServiceDTO } from '../validation/service.validation.js';

export class ServiceRepository {
  async findAll() {
    return db.service.findMany({
      where: { isDeleted: false },
      orderBy: { name: 'asc' }
    });
  }

  async findById(id: string) {
    return db.service.findFirst({
      where: { id, isDeleted: false }
    });
  }

  async create(id: string, data: CreateServiceDTO) {
    const serviceCode = data.code || id;
    return db.service.create({
      data: {
        id,
        code: serviceCode,
        name: data.name,
        category: data.category,
        price: data.price,
        minPrice: data.minPrice ?? 0,
        gst: data.gst ?? 18,
        duration: data.duration,
        warranty: data.warranty || "1 Year",
        desc: data.desc || "",
        status: data.status || "Active",
      }
    });
  }

  async update(id: string, data: UpdateServiceDTO) {
    return db.service.update({
      where: { id },
      data
    });
  }

  async softDelete(id: string) {
    return db.service.update({
      where: { id },
      data: { isDeleted: true, status: "Inactive", deletedAt: new Date().toISOString() }
    });
  }
}

