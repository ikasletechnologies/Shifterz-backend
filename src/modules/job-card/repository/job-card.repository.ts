import { db } from '../../../lib/db.js';
import type { CreateJobCardDTO, UpdateJobCardDTO } from '../validation/job-card.validation.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';

export class JobCardRepository {
  async findAll(filter: any) {
    return db.job.findMany({
      where: filter,
      orderBy: { createdAt: "desc" },
    });
  }

  async findEmployeeByName(name: string) {
    return db.employee.findFirst({ where: { name } });
  }

  async create(id: string, data: CreateJobCardDTO, techId: string | null) {
    return db.job.create({
      data: {
        id,
        vehicle: data.vehicle,
        customer: data.customer || "",
        service: data.service || "",
        technician: data.technician || "",
        technicianId: techId,
        status: data.status || "Pending",
        priority: data.priority ?? "",
        startDate: data.startDate || new Date().toISOString().slice(0, 10),
        estCompletion: data.estCompletion || "",
        notes: data.notes || "",
        photos: data.photos || [],
      },
    });
  }

  async update(id: string, data: UpdateJobCardDTO) {
    try {
      return await db.job.update({
        where: { id },
        data: {
          technician: data.technician,
          technicianId: data.technicianId,
          status: data.status,
          priority: data.priority,
          estCompletion: data.estCompletion,
          notes: data.notes,
          photos: data.photos,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2025') {
        throw new NotFoundError(`Job card with ID '${id}' not found.`);
      }
      throw err;
    }
  }

  async softDelete(id: string) {
    try {
      return await db.job.update({
        where: { id },
        data: { isDeleted: true, deletedAt: new Date().toISOString() },
      });
    } catch (err: any) {
      if (err.code === 'P2025') {
        throw new NotFoundError(`Job card with ID '${id}' not found.`);
      }
      throw err;
    }
  }
}
