import { db } from '../../../lib/db.js';
import type { CreateJobCardDTO, UpdateJobCardDTO } from '../validation/job-card.validation.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';

function safeIsoDate(input?: string | Date | null): string {
  if (!input) return new Date().toISOString();
  if (typeof input === 'string' && !input.trim()) return new Date().toISOString();
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

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
        startDate: safeIsoDate(data.startDate),
        estCompletion: safeIsoDate(data.estCompletion),
        notes: data.notes || "",
        photos: data.photos || [],
      },
    });
  }

  async update(id: string, data: UpdateJobCardDTO) {
    try {
      const updateData: any = {};
      if (data.technician !== undefined) updateData.technician = data.technician;
      if (data.technicianId !== undefined) updateData.technicianId = data.technicianId;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.priority !== undefined) updateData.priority = data.priority;
      if (data.estCompletion !== undefined && data.estCompletion !== null) {
        updateData.estCompletion = safeIsoDate(data.estCompletion);
      }
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.photos !== undefined) updateData.photos = data.photos;

      return await db.job.update({
        where: { id },
        data: updateData,
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
