import { QcRepository } from './qc.repository.js';
import type { AssignQcDTO, QcChecklistDTO, QcDecisionDTO, CreateChecklistTemplateItemDTO, UpdateChecklistTemplateItemDTO } from './qc.validation.js';
import { QC_PHOTO_CATEGORIES } from './qc.validation.js';
import { db } from '../../lib/db.js';
import { NotFoundError } from '../../shared/errors/NotFoundError.js';
import { ForbiddenError } from '../../shared/errors/ForbiddenError.js';
import { ValidationError } from '../../shared/errors/ValidationError.js';
import {
  notifyQcAssigned,
  notifyQcFailed,
  notifyQcPassed,
} from '../../shared/services/notification.service.js';

const HQ_ROLES = ['SUPER_ADMIN', 'HQ_USER'];
const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'HQ_USER', 'FRANCHISE_ADMIN', 'BRANCH_MANAGER'];
const QC_ROLES = ['QUALITY_INSPECTOR', 'QUALITY_INSPECTION', 'QC_INSPECTOR', 'QC', 'QUALITY_ASSURANCE'];
const normalizeRole = (role?: string) => (role || '').toUpperCase().replace(/[\s_]+/g, '_');

type ActingUser = { id?: string; name?: string; role?: string; franchiseId?: string | null };

export class QcService {
  constructor(private readonly repository: QcRepository = new QcRepository()) {}

  // ─── Access Control (12.11.2) ──────────────────────────────────────────────

  private checkQcAccess(user?: ActingUser) {
    const role = normalizeRole(user?.role);
    if (!QC_ROLES.includes(role) && !MANAGEMENT_ROLES.includes(role)) {
      throw new ForbiddenError("Only an authorized Quality Inspector or management may perform this action.");
    }
  }

  private async getJobOrThrow(jobId: string) {
    const job = await this.repository.findJobById(jobId);
    if (!job) throw new NotFoundError("Job card not found");
    return job;
  }

  // ─── QC Queue ─────────────────────────────────────────────────────────────

  async getQueue(franchiseId: string | null) {
    return this.repository.getQueue(franchiseId);
  }

  // ─── QC Assignment (12.3) ──────────────────────────────────────────────────

  async assignInspector(jobId: string, data: AssignQcDTO, user?: ActingUser) {
    const role = normalizeRole(user?.role);
    if (!MANAGEMENT_ROLES.includes(role)) {
      throw new ForbiddenError("Only management may assign a Quality Inspector.");
    }

    const job = await this.getJobOrThrow(jobId);
    const inspector = await db.employee.findFirst({ where: { id: data.inspectorId, isDeleted: false } });
    if (!inspector) throw new NotFoundError("Quality Inspector not found");

    const attemptNumber = job.qcAttemptCount + 1;
    const inspection = await this.repository.createInspection(jobId, attemptNumber, {
      inspectorId: inspector.id,
      inspectorName: inspector.name,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      priority: data.priority || null,
      assignRemarks: data.remarks || null,
      franchiseId: job.franchiseId,
    });

    await this.repository.updateJob(jobId, {
      qcAttemptCount: attemptNumber,
      qcById: inspector.id,
      qcBy: inspector.name,
    });

    notifyQcAssigned({ jobId, vehicle: job.vehicle, inspectorId: inspector.id }).catch(console.error);

    return inspection;
  }

  // ─── Open Attempt (lazily created if assignment step was skipped) ─────────

  async getOrCreateOpenInspection(jobId: string, user?: ActingUser) {
    const job = await this.getJobOrThrow(jobId);
    let inspection = await this.repository.findOpenInspection(jobId);
    if (inspection) return inspection;

    const attemptNumber = job.qcAttemptCount + 1;
    inspection = await this.repository.createInspection(jobId, attemptNumber, {
      inspectorId: user?.id || null,
      inspectorName: user?.name || null,
      franchiseId: job.franchiseId,
    });
    await this.repository.updateJob(jobId, {
      qcAttemptCount: attemptNumber,
      qcById: user?.id || null,
      qcBy: user?.name || null,
    });
    return inspection;
  }

  // ─── QC Checklist (12.4) ───────────────────────────────────────────────────

  async submitChecklist(jobId: string, checklist: QcChecklistDTO['checklist'], user?: ActingUser) {
    this.checkQcAccess(user);
    const job = await this.getJobOrThrow(jobId);

    const template = await this.repository.findChecklistTemplate(job.franchiseId);
    const templateIds = new Set(template.map((t) => t.id));
    const unknownIds = checklist.filter((item) => !templateIds.has(item.id)).map((item) => item.id);
    if (unknownIds.length > 0) {
      throw new ValidationError(`Checklist contains items not in the configured template: ${unknownIds.join(', ')}`);
    }

    const inspection = await this.getOrCreateOpenInspection(jobId, user);
    const enrichedChecklist = checklist.map((item) => {
      const meta = template.find((t) => t.id === item.id);
      return { ...item, label: meta?.label, category: meta?.category };
    });

    return this.repository.updateInspection(inspection.id, { checklist: enrichedChecklist });
  }

  // ─── Photo Verification (12.5) ─────────────────────────────────────────────

  async uploadPhotos(jobId: string, category: string, urls: string[], user?: ActingUser) {
    this.checkQcAccess(user);
    const job = await this.getJobOrThrow(jobId);

    if (!(QC_PHOTO_CATEGORIES as readonly string[]).includes(category)) {
      throw new ValidationError(`Invalid QC photo category "${category}". Must be one of: ${QC_PHOTO_CATEGORIES.join(', ')}.`);
    }

    const inspection = await this.getOrCreateOpenInspection(jobId, user);
    return this.repository.createQcPhotos(jobId, inspection.id, category, urls, {
      id: user?.id,
      name: user?.name,
      franchiseId: user?.franchiseId || job.franchiseId,
    });
  }

  // ─── QC Decision (12.6) ────────────────────────────────────────────────────

  async decide(jobId: string, data: QcDecisionDTO, user?: ActingUser) {
    this.checkQcAccess(user);
    const job = await this.getJobOrThrow(jobId);

    const inspection = await this.repository.findOpenInspection(jobId);
    if (!inspection) {
      throw new ValidationError("No open QC inspection for this job. Submit a checklist before recording a decision.");
    }

    await this.repository.updateInspection(inspection.id, {
      result: data.result,
      reason: data.reason || null,
      remarks: data.remarks || null,
      reworkRequired: data.result === 'Failed' ? (data.reworkRequired ?? true) : false,
      decidedAt: new Date(),
    });

    if (data.result === 'Passed') {
      const updated = await this.repository.updateJob(jobId, {
        status: 'Ready For Billing',
        passedAt: new Date(),
      });

      notifyQcPassed({
        franchiseId: job.franchiseId,
        jobId,
        vehicle: job.vehicle,
        customerName: job.customer,
      }).catch(console.error);

      return updated;
    }

    // Failed
    const updated = await this.repository.updateJob(jobId, {
      status: 'Rework Required',
      failedAt: new Date(),
      isRework: true,
      reworkCount: { increment: 1 },
    });

    notifyQcFailed({
      jobId,
      vehicle: job.vehicle,
      technicianId: job.technicianId,
      reason: data.reason,
    }).catch(console.error);

    return updated;
  }

  // ─── QC History (12.8) ─────────────────────────────────────────────────────

  async listInspections(jobId: string) {
    await this.getJobOrThrow(jobId);
    return this.repository.listInspections(jobId);
  }

  // ─── Checklist Template (12.4, HQ-configurable) ────────────────────────────

  async getChecklistTemplate(franchiseId: string | null) {
    return this.repository.findChecklistTemplate(franchiseId);
  }

  async createChecklistTemplateItem(data: CreateChecklistTemplateItemDTO, user?: ActingUser) {
    const isHq = HQ_ROLES.includes(normalizeRole(user?.role));
    if (!isHq) {
      if (!user?.franchiseId) {
        throw new ForbiddenError("Only HQ may create a global checklist item.");
      }
      data = { ...data, franchiseId: user.franchiseId };
    }
    return this.repository.createChecklistTemplateItem(data);
  }

  async updateChecklistTemplateItem(id: string, data: UpdateChecklistTemplateItemDTO) {
    const existing = await this.repository.findChecklistTemplateItemById(id);
    if (!existing) throw new NotFoundError("Checklist item not found");
    return this.repository.updateChecklistTemplateItem(id, data);
  }

  async deleteChecklistTemplateItem(id: string) {
    const existing = await this.repository.findChecklistTemplateItemById(id);
    if (!existing) throw new NotFoundError("Checklist item not found");
    if (existing.isDefault) {
      throw new ForbiddenError("Default checklist items cannot be removed.");
    }
    return this.repository.softDeleteChecklistTemplateItem(id);
  }
}
