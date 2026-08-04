import { db } from '../../lib/db.js';
import type { CreateChecklistTemplateItemDTO, UpdateChecklistTemplateItemDTO } from './qc.validation.js';

const QC_QUEUE_STATUSES = ['Waiting for Quality Check', 'Inspecting', 'Rework Required'];

export class QcRepository {
  // ─── QC Queue ─────────────────────────────────────────────────────────────

  async getQueue(franchiseId: string | null) {
    const where: any = { isDeleted: false, status: { in: QC_QUEUE_STATUSES } };
    if (franchiseId) where.franchiseId = franchiseId;
    return db.job.findMany({ where, orderBy: { updatedAt: 'asc' } });
  }

  // ─── QC Inspections (attempts) ────────────────────────────────────────────

  async findOpenInspection(jobId: string) {
    return db.qCInspection.findFirst({
      where: { jobId, result: 'Pending' },
      orderBy: { attemptNumber: 'desc' },
    });
  }

  async createInspection(jobId: string, attemptNumber: number, data: {
    inspectorId?: string | null; inspectorName?: string | null;
    scheduledAt?: Date | null; priority?: string | null; assignRemarks?: string | null;
    franchiseId?: string | null;
  }) {
    return db.qCInspection.create({
      data: {
        jobId,
        attemptNumber,
        inspectorId: data.inspectorId || null,
        inspectorName: data.inspectorName || null,
        scheduledAt: data.scheduledAt || null,
        priority: data.priority || null,
        assignRemarks: data.assignRemarks || null,
        franchiseId: data.franchiseId || null,
      },
    });
  }

  async updateInspection(id: string, data: any) {
    return db.qCInspection.update({ where: { id }, data });
  }

  async findInspectionById(id: string) {
    return db.qCInspection.findFirst({ where: { id } });
  }

  async listInspections(jobId: string) {
    return db.qCInspection.findMany({
      where: { jobId },
      orderBy: { attemptNumber: 'desc' },
      include: { photos: true },
    });
  }

  // ─── QC Photos ────────────────────────────────────────────────────────────

  async createQcPhotos(jobId: string, qcInspectionId: string, category: string, urls: string[], user?: { id?: string; name?: string; franchiseId?: string | null }) {
    await db.jobPhoto.createMany({
      data: urls.map((url) => ({
        jobId,
        url,
        category,
        qcInspectionId,
        uploadedById: user?.id || null,
        uploadedBy: user?.name || null,
        franchiseId: user?.franchiseId || null,
      })),
    });
    return db.jobPhoto.findMany({ where: { qcInspectionId }, orderBy: { createdAt: 'desc' } });
  }

  // ─── Checklist Template (12.4) ────────────────────────────────────────────

  async findChecklistTemplate(franchiseId: string | null) {
    return db.qCChecklistTemplate.findMany({
      where: {
        isDeleted: false,
        OR: [{ franchiseId: null }, { franchiseId: franchiseId || undefined }],
      },
      orderBy: [{ category: 'asc' }, { order: 'asc' }],
    });
  }

  async findChecklistTemplateItemById(id: string) {
    return db.qCChecklistTemplate.findFirst({ where: { id, isDeleted: false } });
  }

  async createChecklistTemplateItem(data: CreateChecklistTemplateItemDTO) {
    return db.qCChecklistTemplate.create({
      data: {
        category: data.category,
        label: data.label,
        order: data.order ?? 0,
        franchiseId: data.franchiseId || null,
      },
    });
  }

  async updateChecklistTemplateItem(id: string, data: UpdateChecklistTemplateItemDTO) {
    return db.qCChecklistTemplate.update({ where: { id }, data });
  }

  async softDeleteChecklistTemplateItem(id: string) {
    return db.qCChecklistTemplate.update({ where: { id }, data: { isDeleted: true } });
  }

  // ─── Job lookup (used by service for gating/notifications) ────────────────

  async findJobById(jobId: string) {
    return db.job.findFirst({ where: { id: jobId, isDeleted: false } });
  }

  async updateJob(jobId: string, data: any) {
    return db.job.update({ where: { id: jobId }, data });
  }
}
