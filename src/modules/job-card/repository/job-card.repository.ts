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
    const parseDate = (val?: string | null) => {
      if (!val || (typeof val === 'string' && !val.trim())) return new Date();
      const d = new Date(val);
      return isNaN(d.getTime()) ? new Date() : d;
    };

    const startDate = parseDate(data.startDate);
    const estCompletion = parseDate(data.estCompletion);

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
        startDate,
        estCompletion,
        notes: data.notes || "",
        photos: data.photos || [],
      },
    });
  }

  async update(id: string, data: any) {
    try {
      const updateData: any = {};
      if (data.vehicle !== undefined) updateData.vehicle = data.vehicle;
      if (data.customer !== undefined) updateData.customer = data.customer;
      if (data.service !== undefined) updateData.service = data.service;
      if (data.technician !== undefined) updateData.technician = data.technician;
      if (data.technicianId !== undefined) updateData.technicianId = data.technicianId;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.priority !== undefined) updateData.priority = data.priority;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.photos !== undefined) updateData.photos = data.photos;

      if (data.startDate !== undefined && data.startDate !== null) {
        if (typeof data.startDate === 'string' && data.startDate.trim()) {
          const d = new Date(data.startDate);
          if (!isNaN(d.getTime())) updateData.startDate = d;
        } else if (data.startDate instanceof Date) {
          updateData.startDate = data.startDate;
        }
      }

      if (data.estCompletion !== undefined && data.estCompletion !== null) {
        if (typeof data.estCompletion === 'string' && data.estCompletion.trim()) {
          const d = new Date(data.estCompletion);
          if (!isNaN(d.getTime())) updateData.estCompletion = d;
        } else if (data.estCompletion instanceof Date) {
          updateData.estCompletion = data.estCompletion;
        }
      }

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
