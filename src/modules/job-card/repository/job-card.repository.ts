import { db } from '../../../lib/db.js';
import type { CreateJobCardDTO, UpdateJobCardDTO } from '../validation/job-card.validation.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';

export class JobCardRepository {
  async findAll(filter: any) {
    const isDeletedFilter = { isDeleted: false };
    const whereClause = filter && Object.keys(filter).length > 0
      ? { AND: [filter, isDeletedFilter] }
      : isDeletedFilter;

    const jobs = await db.job.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    const carIns = await db.carIn.findMany({ where: { isDeleted: false } });
    const customers = await db.customer.findMany({ where: { isDeleted: false } });

    const carInMapByJobId = new Map<string, any>();
    const carInMapByVehicle = new Map<string, any>();
    carIns.forEach((ci) => {
      if (ci.jobCardId) carInMapByJobId.set(ci.jobCardId, ci);
      if (ci.vehicle) carInMapByVehicle.set(ci.vehicle.trim().toUpperCase(), ci);
    });

    const customerMapByName = new Map<string, string>();
    customers.forEach((c) => {
      if (c.name && c.phone) customerMapByName.set(c.name.trim().toLowerCase(), c.phone);
    });

    const existingJobIds = new Set(jobs.map((j) => j.id));
    const existingVehicles = new Set(jobs.map((j) => (j.vehicle || "").trim().toUpperCase()));

    const resultList = jobs.map((j) => {
      const ci = carInMapByJobId.get(j.id) || carInMapByVehicle.get((j.vehicle || "").trim().toUpperCase());
      const isDeliveredInCarIn = ci && (ci.status === "Delivered" || ci.status === "Out" || ci.outTime !== null);
      const finalStatus = isDeliveredInCarIn ? "Delivered" : j.status;

      const phone =
        (ci && ci.phone) ||
        customerMapByName.get((j.customer || "").trim().toLowerCase()) ||
        "";

      return {
        ...j,
        status: finalStatus,
        phone,
        customerPhone: phone,
        receivedAt: j.createdAt,
      };
    });

    carIns.forEach((ci) => {
      const isDelivered = ci.status === "Delivered" || ci.status === "Out" || ci.outTime !== null;
      const vNorm = (ci.vehicle || "").trim().toUpperCase();
      const hasJob = (ci.jobCardId && existingJobIds.has(ci.jobCardId)) || existingVehicles.has(vNorm);

      if (isDelivered && !hasJob) {
        resultList.push({
          id: ci.jobCardId || ci.id,
          vehicle: ci.vehicle || "",
          customer: ci.customer || "",
          service: ci.service || "",
          technician: "",
          status: "Delivered",
          priority: "",
          startDate: ci.inTime || new Date(),
          estCompletion: ci.outTime || ci.inTime || new Date(),
          actualCompletion: ci.outTime || ci.inTime || new Date(),
          notes: ci.notes || "",
          photos: [],
          phone: ci.phone || "",
          customerPhone: ci.phone || "",
          receivedAt: ci.inTime || new Date(),
        } as any);
      }
    });

    return resultList;
  }

  async findById(id: string) {
    const job = await db.job.findFirst({ where: { id, isDeleted: false } });
    if (job) return job;
    const carIn = await db.carIn.findFirst({ where: { id, isDeleted: false } });
    if (carIn && carIn.jobCardId) {
      return db.job.findFirst({ where: { id: carIn.jobCardId, isDeleted: false } });
    }
    return null;
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
        serviceAdvisor: data.serviceAdvisor || "",
        serviceAdvisorId: data.serviceAdvisorId || null,
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
      let targetJobId = id;
      const existing = await db.job.findFirst({ where: { id, isDeleted: false } });
      if (!existing) {
        const carIn = await db.carIn.findFirst({ where: { id, isDeleted: false } });
        if (carIn && carIn.jobCardId) {
          targetJobId = carIn.jobCardId;
        }
      }

      const updateData: any = {};
      if (data.vehicle !== undefined) updateData.vehicle = data.vehicle;
      if (data.customer !== undefined) updateData.customer = data.customer;
      if (data.service !== undefined) updateData.service = data.service;
      if (data.technician !== undefined) updateData.technician = data.technician;
      if (data.technicianId !== undefined) updateData.technicianId = data.technicianId;
      if (data.serviceAdvisor !== undefined) updateData.serviceAdvisor = data.serviceAdvisor;
      if (data.serviceAdvisorId !== undefined) updateData.serviceAdvisorId = data.serviceAdvisorId;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.priority !== undefined) updateData.priority = data.priority;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.photos !== undefined) updateData.photos = data.photos;
      if (data.qcNotes !== undefined) updateData.qcNotes = data.qcNotes;
      if (data.qcById !== undefined) updateData.qcById = data.qcById;
      if (data.qcBy !== undefined) updateData.qcBy = data.qcBy;
      if (data.isRework !== undefined) updateData.isRework = data.isRework;
      if (data.reworkCount !== undefined) updateData.reworkCount = data.reworkCount;

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

      if (data.actualCompletion !== undefined && data.actualCompletion !== null) {
        const raw = data.actualCompletion;
        if (typeof raw === 'string' && raw.trim()) {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) updateData.actualCompletion = d;
        } else if (raw instanceof Date) {
          updateData.actualCompletion = raw;
        }
      }

      if (data.passedAt !== undefined && data.passedAt !== null) {
        const raw = data.passedAt;
        if (typeof raw === 'string' && raw.trim()) {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) updateData.passedAt = d;
        } else if (raw instanceof Date) {
          updateData.passedAt = raw;
        }
      }

      if (data.failedAt !== undefined && data.failedAt !== null) {
        const raw = data.failedAt;
        if (typeof raw === 'string' && raw.trim()) {
          const d = new Date(raw);
          if (!isNaN(d.getTime())) updateData.failedAt = d;
        } else if (raw instanceof Date) {
          updateData.failedAt = raw;
        }
      }

      return await db.job.update({
        where: { id: targetJobId },
        data: updateData,
      });
    } catch (err: any) {
      if (err.code === 'P2025') {
        throw new NotFoundError(`Job card with ID '${id}' not found.`);
      }
      throw err;
    }
  }

  async updateChecklist(id: string, checklist: any) {
    return db.job.update({ where: { id }, data: { checklist } });
  }

  async appendQcPhotos(id: string, urls: string[]) {
    const job = await db.job.findFirst({ where: { id } });
    const existing = job?.qcPhotos || [];
    return db.job.update({ where: { id }, data: { qcPhotos: [...existing, ...urls] } });
  }

  async softDelete(id: string) {
    try {
      let targetJobId = id;
      const existing = await db.job.findFirst({ where: { id } });
      if (!existing) {
        const carIn = await db.carIn.findFirst({ where: { id } });
        if (carIn && carIn.jobCardId) {
          targetJobId = carIn.jobCardId;
        }
      }

      await db.job.updateMany({
        where: { id: targetJobId },
        data: { isDeleted: true, deletedAt: new Date().toISOString() },
      });

      return await db.job.delete({ where: { id: targetJobId } }).catch(() => null);
    } catch (err: any) {
      if (err.code === 'P2025') {
        throw new NotFoundError(`Job card with ID '${id}' not found.`);
      }
      throw err;
    }
  }
}
