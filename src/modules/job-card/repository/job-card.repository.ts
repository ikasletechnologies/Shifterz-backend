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

    // The synthetic "delivered but no job card yet" entries below are built
    // directly from carIn records, bypassing `filter` entirely — so the
    // franchise scope has to be re-applied here too, or a branch admin could
    // still see another branch's/HQ's vehicles through this fallback path.
    const franchiseId = (filter as any)?.franchiseId;
    const carIns = await db.carIn.findMany({
      where: franchiseId ? { isDeleted: false, franchiseId } : { isDeleted: false },
    });
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
        services: data.services || null,
        technician: data.technician || "",
        technicianId: techId,
        serviceAdvisor: data.serviceAdvisor || "",
        serviceAdvisorId: data.serviceAdvisorId || null,
        status: data.status || "Pending",
        priority: data.priority ?? "",
        startDate,
        estCompletion,
        notes: data.notes || "",
        remarks: data.remarks || null,
        carInId: data.carInId || null,
        photos: data.photos || [],
        customerSignature: data.customerSignature || null,
        companyAcknowledgement: data.companyAcknowledgement || null,
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
      if (data.remarks !== undefined) updateData.remarks = data.remarks;
      if (data.carInId !== undefined) updateData.carInId = data.carInId;
      if (data.photos !== undefined) updateData.photos = data.photos;
      if (data.services !== undefined) updateData.services = data.services;
      if (data.customerSignature !== undefined) updateData.customerSignature = data.customerSignature;
      if (data.companyAcknowledgement !== undefined) updateData.companyAcknowledgement = data.companyAcknowledgement;
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

  // ─── Job History ──────────────────────────────────────────────────────────

  async getHistory(jobId: string) {
    const auditLogs = await db.auditLog.findMany({
      where: {
        recordId: jobId,
        module: {
          in: [
            'JOB', 'ADDITIONAL_WORK', 'JOB_STAGE', 'JOB_PHOTO',
            'WORK_NOTE', 'MATERIAL_CONSUMPTION', 'JOB_COMPLETION', 'QC',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const jobHistories = await db.jobHistory.findMany({
      where: { jobId },
      orderBy: { createdAt: 'desc' },
    });

    // Merge and sort
    const merged = [
      ...auditLogs.map(log => ({
        id: log.id,
        type: 'AUDIT',
        event: log.action,
        performedBy: log.userId,
        createdAt: log.createdAt,
        payload: { module: log.module, newValue: log.newValue, oldValue: log.oldValue },
      })),
      ...jobHistories.map(h => ({
        id: h.id,
        type: 'HISTORY',
        event: h.event,
        performedBy: h.performedBy,
        createdAt: h.createdAt,
        payload: h.payload,
      }))
    ];

    return merged.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getWithDetails(id: string) {
    return db.job.findFirst({
      where: { id, isDeleted: false },
      include: {
        additionalWorks: { where: { isDeleted: false }, orderBy: { createdAt: 'desc' } },
        jobPhotos: { orderBy: { createdAt: 'desc' } },
        workNotes: { orderBy: { createdAt: 'desc' } },
        materialConsumptions: { where: { isDeleted: false }, orderBy: { createdAt: 'desc' } },
      },
    });
  }

  // ─── Work Stage (10.5) ────────────────────────────────────────────────────

  async findWorkflowStage(name: string, franchiseId: string | null) {
    return db.workflowStage.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        isDeleted: false,
        OR: [{ franchiseId: null }, { franchiseId: franchiseId || undefined }],
      },
    });
  }

  // ─── Work Photos (10.6) ───────────────────────────────────────────────────

  async createJobPhotos(jobId: string, category: string, urls: string[], user?: { id?: string; name?: string; franchiseId?: string | null }) {
    await db.jobPhoto.createMany({
      data: urls.map((url) => ({
        jobId,
        url,
        category,
        uploadedById: user?.id || null,
        uploadedBy: user?.name || null,
        franchiseId: user?.franchiseId || null,
      })),
    });
    return this.listJobPhotos(jobId);
  }

  async listJobPhotos(jobId: string) {
    return db.jobPhoto.findMany({ where: { jobId }, orderBy: { createdAt: 'desc' } });
  }

  // ─── Work Notes (10.9) ────────────────────────────────────────────────────

  async createWorkNote(jobId: string, note: string, user?: { id?: string; name?: string; franchiseId?: string | null }) {
    return db.workNote.create({
      data: {
        jobId,
        note,
        createdById: user?.id || null,
        createdBy: user?.name || null,
        franchiseId: user?.franchiseId || null,
      },
    });
  }

  async listWorkNotes(jobId: string) {
    return db.workNote.findMany({ where: { jobId }, orderBy: { createdAt: 'desc' } });
  }

  // ─── Material Consumption (10.8) ──────────────────────────────────────────

  async createMaterialConsumption(jobId: string, data: {
    itemId: string; itemName: string; quantity: number; unit?: string | null;
    recordedById?: string | null; recordedBy?: string | null; franchiseId?: string | null;
  }) {
    return db.materialConsumption.create({
      data: {
        jobId,
        itemId: data.itemId,
        itemName: data.itemName,
        quantity: data.quantity,
        unit: data.unit || null,
        status: 'Pending',
        recordedById: data.recordedById || null,
        recordedBy: data.recordedBy || null,
        franchiseId: data.franchiseId || null,
      },
    });
  }

  async listMaterialConsumptions(jobId: string) {
    return db.materialConsumption.findMany({ where: { jobId, isDeleted: false }, orderBy: { createdAt: 'desc' } });
  }

  async findMaterialConsumptionById(id: string) {
    return db.materialConsumption.findFirst({ where: { id, isDeleted: false } });
  }

  async updateMaterialConsumption(id: string, data: {
    status: 'Approved' | 'Rejected'; approvedById?: string | null; approvedBy?: string | null; rejectionNote?: string | null;
  }) {
    return db.materialConsumption.update({
      where: { id },
      data: {
        status: data.status,
        approvedById: data.approvedById || null,
        approvedBy: data.approvedBy || null,
        approvedAt: data.status === 'Approved' ? new Date() : null,
        rejectionNote: data.rejectionNote || null,
      },
    });
  }

  // ─── Additional Work ──────────────────────────────────────────────────────

  async createAdditionalWork(id: string, jobId: string, data: {
    description: string;
    estimatedCost: number;
    requestedById?: string | null;
    requestedBy?: string | null;
    franchiseId?: string | null;
  }) {
    return db.additionalWork.create({
      data: {
        id,
        jobId,
        description: data.description,
        estimatedCost: data.estimatedCost,
        status: 'Pending',
        requestedById: data.requestedById || null,
        requestedBy: data.requestedBy || null,
        franchiseId: data.franchiseId || null,
      },
    });
  }

  async approveAdditionalWork(id: string, data: {
    status: 'Approved' | 'Rejected';
    approvedById?: string | null;
    approvedBy?: string | null;
    rejectionNote?: string | null;
  }) {
    return db.additionalWork.update({
      where: { id },
      data: {
        status: data.status,
        approvedById: data.approvedById || null,
        approvedBy: data.approvedBy || null,
        approvedAt: data.status === 'Approved' ? new Date() : null,
        rejectedAt: data.status === 'Rejected' ? new Date() : null,
        rejectionNote: data.rejectionNote || null,
      },
    });
  }

  async listAdditionalWorks(jobId: string) {
    return db.additionalWork.findMany({
      where: { jobId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });
  }
}
