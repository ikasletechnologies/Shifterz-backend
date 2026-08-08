import { JobCardRepository } from '../repository/job-card.repository.js';
import type { CreateJobCardDTO, UpdateJobCardDTO, QcChecklistDTO } from '../validation/job-card.validation.js';
import { JOB_PHOTO_CATEGORIES } from '../validation/job-card.validation.js';
import { generateSequentialId } from '../../../shared/utils/idGenerator.js';
import { COMPLETED_JOB_STATUSES } from '../../../shared/constants/jobStatus.constants.js';
import { db } from '../../../lib/db.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { InventoryService } from '../../inventory/service/inventory.service.js';
import {
  notifyJobAssigned,
  notifyManagers,
  notifyPriorityChanged,
  notifyAdditionalWorkRequested,
  notifyAdditionalWorkApproval,
  notifyMaterialRequestPending,
  notifyWorkCompletion,
} from '../../../shared/services/notification.service.js';

const QC_TRANSITION_STATUSES = ["Inspecting", "QC Passed", "QC Failed", "Rework"];
const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'HQ_USER', 'FRANCHISE_ADMIN', 'BRANCH_MANAGER'];
const normalizeRole = (role?: string) => (role || '').toUpperCase().replace(/[\s_]+/g, '_');

export class JobCardService {
  constructor(private readonly repository: JobCardRepository = new JobCardRepository()) { }

  async checkTechnicianAccess(jobId: string, user?: { id?: string; name?: string; role?: string }) {
    if (!user) return;
    const userRole = (user.role || "").toUpperCase().replace(/[\s_]+/g, "_");
    if (userRole !== "TECHNICIAN") return;

    const job = await this.repository.findById(jobId);
    if (!job) throw new NotFoundError("Job card not found");

    const userId = user.id;
    const userName = user.name ? user.name.trim().toLowerCase() : "";

    const techIdMatch = Boolean(userId && job.technicianId === userId);
    const techNameMatch = Boolean(
      userName &&
      job.technician &&
      job.technician.trim().toLowerCase() === userName &&
      job.technician.trim().toLowerCase() !== "unassigned"
    );

    if (!techIdMatch && !techNameMatch) {
      throw new ForbiddenError("You do not have permission to access or modify this job card");
    }
  }

  async getJobs(filter: any) {
    return this.repository.findAll(filter);
  }

  async createJob(data: CreateJobCardDTO, user?: { id?: string; name?: string }) {
    // ── Rule 2: A Job Card shall be created only after estimate approval ─────
    const estimate = await db.estimate.findFirst({
      where: { vehicle: data.vehicle, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    if (estimate && estimate.status !== 'Approved') {
      throw new ValidationError(
        `Job Card creation blocked. An estimate exists for vehicle ${data.vehicle} but is not approved (current status: "${estimate.status}").`
      );
    }

    const jobId = await generateSequentialId("JOB");

    let techId = data.technicianId || null;
    if (!techId && data.technician) {
      const techRecord = await this.repository.findEmployeeByName(data.technician);
      if (techRecord) techId = techRecord.id;
    }

    const createdJob = await this.repository.create(jobId, data, techId);

    // Record creation in activity history
    await db.jobHistory.create({
      data: {
        jobId: createdJob.id,
        event: 'CREATED',
        performedBy: user?.id || 'SYSTEM',
        payload: {
          vehicle: createdJob.vehicle,
          customer: createdJob.customer,
          status: createdJob.status,
        },
      },
    });

    return createdJob;
  }

  async updateJob(id: string, data: UpdateJobCardDTO, user?: { id?: string; name?: string; role?: string }) {
    const job = await this.repository.findById(id);
    if (!job) throw new NotFoundError("Job card not found");

    const userRole = user?.role || "";
    const isHq = userRole === "SUPER_ADMIN" || userRole === "HQ_USER";

    const isAssigneeChange = (data.technicianId !== undefined && data.technicianId !== job.technicianId) ||
      (data.technician !== undefined && data.technician !== job.technician) ||
      (data.serviceAdvisorId !== undefined && data.serviceAdvisorId !== job.serviceAdvisorId) ||
      (data.serviceAdvisor !== undefined && data.serviceAdvisor !== job.serviceAdvisor);

    if (job.assignmentLocked && isAssigneeChange && !isHq) {
      throw new ForbiddenError("This job assignment is locked by HQ and cannot be modified by the franchise.");
    }

    const enriched: any = { ...data };

    if (isHq && isAssigneeChange) {
      enriched.assignmentLocked = true;
      enriched.assignedBy = user?.id || "HQ";
      enriched.assignedByRole = userRole;
    }

    if (data.status) {
      // ── Rule 3: Inspection mandatory before work begins ───────────────────
      // Temporarily disabled to allow job progression without mandatory photos during testing
      /*
      const workActiveStatuses = ['Work In Progress', 'Job Assigned', 'In Progress'];
      if (workActiveStatuses.includes(data.status)) {
        const carIn = await db.carIn.findFirst({
          where: { jobCardId: id, isDeleted: false },
          select: { scratches: true, dents: true, interiorCondition: true, photoFront: true },
        });
        if (carIn) {
          const hasInspection = carIn.scratches !== null || carIn.dents !== null || carIn.interiorCondition !== null;
          const hasPhoto = carIn.photoFront !== null;
          if (!hasInspection || !hasPhoto) {
            throw new ValidationError(
              'Initial inspection and at least one photograph must be recorded before work can begin. Please complete the vehicle inspection first.'
            );
          }
        }
      }
      */

      // ── Rule 4: Estimate must be approved before job is activated ─────────
      const jobInitiationStatuses = ['Job Assigned', 'Work In Progress', 'In Progress'];
      if (jobInitiationStatuses.includes(data.status)) {
        const estimate = await db.estimate.findFirst({
          where: {
            OR: [
              { customerId: { not: null } },
            ],
            isDeleted: false,
          },
          orderBy: { createdAt: 'desc' },
          select: { status: true, vehicle: true },
        });
        // Only block if an estimate exists for this vehicle and it is NOT approved
        const carIn = await db.carIn.findFirst({
          where: { jobCardId: id, isDeleted: false },
          select: { vehicle: true },
        });
        if (carIn) {
          const vehicleEstimate = await db.estimate.findFirst({
            where: { vehicle: carIn.vehicle, isDeleted: false },
            orderBy: { createdAt: 'desc' },
            select: { status: true },
          });
          if (vehicleEstimate && vehicleEstimate.status !== 'Approved') {
            throw new ValidationError(
              `An estimate exists for vehicle ${carIn.vehicle} but has not been approved by the customer (current status: "${vehicleEstimate.status}"). Please obtain customer approval before initiating work.`
            );
          }
        }
      }

      if (QC_TRANSITION_STATUSES.includes(data.status) && user?.id) {
        enriched.qcById = user.id;
        enriched.qcBy = user.name || '';
      }
      if (data.status === 'QC Passed') enriched.passedAt = new Date().toISOString();
      if (data.status === 'QC Failed') enriched.failedAt = new Date().toISOString();
      if (data.status === 'Rework') {
        enriched.isRework = true;
        enriched.reworkCount = { increment: 1 };
      }
      if (COMPLETED_JOB_STATUSES.includes(data.status)) {
        enriched.actualCompletion = new Date().toISOString();
      }
    }

    // ── Rule 5: Price and warranty modifications require authorization ──────
    const isPriceOrWarrantyChange = data.services !== undefined;
    if (isPriceOrWarrantyChange) {
      if (!userRole || !MANAGEMENT_ROLES.includes(normalizeRole(userRole))) {
        throw new ForbiddenError("Only authorized management may modify service prices or warranty terms.");
      }
    }

    const updated = await this.repository.update(id, enriched);

    // ── Rule 9: Maintain complete activity history in JobHistory ────────────
    const historiesToCreate: any[] = [];
    const performedBy = user?.id || 'SYSTEM';

    if (data.status && data.status !== job.status) {
      historiesToCreate.push({
        jobId: id,
        event: data.status === 'QC Passed' ? 'QC_COMPLETED' :
          data.status === 'Delivered' ? 'VEHICLE_DELIVERED' : 'STATUS_CHANGED',
        performedBy,
        payload: { oldStatus: job.status, newStatus: data.status },
      });
    }

    if (isAssigneeChange) {
      historiesToCreate.push({
        jobId: id,
        event: 'EMPLOYEE_ASSIGNED',
        performedBy,
        payload: {
          technicianId: data.technicianId ?? job.technicianId,
          technicianName: data.technician ?? job.technician,
          serviceAdvisorId: data.serviceAdvisorId ?? job.serviceAdvisorId,
          serviceAdvisorName: data.serviceAdvisor ?? job.serviceAdvisor,
        },
      });
    }

    if (isPriceOrWarrantyChange) {
      historiesToCreate.push({
        jobId: id,
        event: 'PRICE_UPDATED', // Or WARRANTY_UPDATED depending on modification type
        performedBy,
        payload: { oldServices: job.services, newServices: data.services },
      });
    }

    if (historiesToCreate.length > 0) {
      await db.jobHistory.createMany({ data: historiesToCreate });
    }

    // ── Notification: Job Assigned to Employee ────────────────────────────
    if (isAssigneeChange) {
      notifyJobAssigned({
        franchiseId: job.franchiseId,
        jobId: id,
        vehicle: job.vehicle,
        customerName: job.customer,
        technicianId: data.technicianId ?? job.technicianId,
        technicianName: data.technician ?? job.technician,
      }).catch(console.error);
    }

    // ── Notification: QC Status Change (branch manager) ───────────────────
    if (data.status && data.status !== job.status && job.franchiseId) {
      notifyManagers(
        job.franchiseId,
        'Quality Control Status Update',
        `Job ${id} (${job.vehicle} – ${job.customer}) status updated to: ${data.status}.`
      ).catch(console.error);
    }

    // ── Notification: Priority Changed (10.13) ─────────────────────────────
    if (data.priority !== undefined && data.priority !== job.priority) {
      notifyPriorityChanged({
        jobId: id,
        vehicle: job.vehicle,
        technicianId: data.technicianId ?? job.technicianId,
        newPriority: data.priority,
      }).catch(console.error);
    }

    return updated;
  }

  async submitChecklist(id: string, checklist: QcChecklistDTO['checklist']) {
    const job = await this.repository.findById(id);
    if (!job) throw new NotFoundError("Job card not found");
    return this.repository.updateChecklist(id, checklist);
  }

  async appendQcPhotos(id: string, urls: string[]) {
    const job = await this.repository.findById(id);
    if (!job) throw new NotFoundError("Job card not found");
    return this.repository.appendQcPhotos(id, urls);
  }

  async deleteJob(id: string) {
    return this.repository.softDelete(id);
  }

  // ─── Job Details (with Additional Works) ─────────────────────────────────────

  async getJobWithDetails(id: string) {
    const job = await this.repository.getWithDetails(id);
    if (!job) throw new NotFoundError("Job card not found");
    return job;
  }

  // ─── Job History ──────────────────────────────────────────────────────────────

  async getJobHistory(id: string) {
    const job = await this.repository.findById(id);
    if (!job) throw new NotFoundError("Job card not found");
    return this.repository.getHistory(id);
  }

  // ─── Additional Work ─────────────────────────────────────────────────────────

  async requestAdditionalWork(
    jobId: string,
    data: { description: string; estimatedCost: number },
    user?: { id?: string; name?: string; franchiseId?: string }
  ) {
    const job = await this.repository.findById(jobId);
    if (!job) throw new NotFoundError("Job card not found");
    if (job.isDeleted) throw new NotFoundError("Job card not found");

    const id = await import('../../../shared/utils/idGenerator.js').then(m => m.generateUid('AW'));
    const record = await this.repository.createAdditionalWork(id, jobId, {
      description: data.description,
      estimatedCost: data.estimatedCost,
      requestedById: user?.id || null,
      requestedBy: user?.name || null,
      franchiseId: user?.franchiseId || job.franchiseId,
    });

    notifyAdditionalWorkRequested({
      franchiseId: user?.franchiseId || job.franchiseId,
      jobId,
      vehicle: job.vehicle,
      description: data.description,
      requestedBy: user?.name || null,
    }).catch(console.error);

    return record;
  }

  async resolveAdditionalWork(
    id: string,
    data: { status: 'Approved' | 'Rejected'; rejectionNote?: string | null; customerApproved?: boolean },
    user?: { id?: string; name?: string; role?: string }
  ) {
    // Only management can approve/reject additional work
    const userRole = normalizeRole(user?.role);
    if (!MANAGEMENT_ROLES.includes(userRole)) {
      throw new ForbiddenError("Only authorized management may approve or reject additional work.");
    }

    const existing = await db.additionalWork.findFirst({ where: { id, isDeleted: false } });
    if (!existing) throw new NotFoundError("Additional work request not found");

    // 10.14.4: Additional work shall require customer approval before execution
    if (data.status === 'Approved' && data.customerApproved !== true) {
      throw new ValidationError("Customer approval must be confirmed before approving additional work.");
    }

    const result = await this.repository.approveAdditionalWork(id, {
      status: data.status,
      approvedById: user?.id || null,
      approvedBy: user?.name || null,
      rejectionNote: data.rejectionNote,
    });

    if (data.status === 'Approved') {
      await db.additionalWork.update({ where: { id }, data: { customerApproved: true } });
      await db.jobHistory.create({
        data: {
          jobId: existing.jobId,
          event: 'ADDITIONAL_WORK_APPROVED',
          performedBy: user?.id || 'SYSTEM',
          payload: { additionalWorkId: id, description: existing.description, cost: existing.estimatedCost },
        },
      });
    }

    const job = await this.repository.findById(existing.jobId);
    if (job) {
      notifyAdditionalWorkApproval({
        jobId: existing.jobId,
        vehicle: job.vehicle,
        requestedById: existing.requestedById,
        status: data.status,
      }).catch(console.error);
    }

    return result;
  }

  async listAdditionalWorks(jobId: string) {
    const job = await this.repository.findById(jobId);
    if (!job) throw new NotFoundError("Job card not found");
    return this.repository.listAdditionalWorks(jobId);
  }

  // ─── Work Stage (10.5) ────────────────────────────────────────────────────

  async updateWorkStage(jobId: string, stage: string, notes: string | undefined, user?: { id?: string; name?: string; role?: string; franchiseId?: string | null }) {
    await this.checkTechnicianAccess(jobId, user);
    const job = await this.repository.findById(jobId);
    if (!job) throw new NotFoundError("Job card not found");

    const workflowStage = await this.repository.findWorkflowStage(stage, job.franchiseId);
    if (!workflowStage) {
      throw new ValidationError(`"${stage}" is not a configured work stage. Ask HQ to add it if it's new.`);
    }

    return this.repository.update(jobId, { status: workflowStage.name, ...(notes ? { notes } : {}) });
  }

  // ─── Work Photographs (10.6) ──────────────────────────────────────────────

  async uploadJobPhotos(jobId: string, category: string, urls: string[], user?: { id?: string; name?: string; role?: string; franchiseId?: string | null }) {
    await this.checkTechnicianAccess(jobId, user);
    const job = await this.repository.findById(jobId);
    if (!job) throw new NotFoundError("Job card not found");

    if (!(JOB_PHOTO_CATEGORIES as readonly string[]).includes(category)) {
      throw new ValidationError(`Invalid photo category "${category}". Must be one of: ${JOB_PHOTO_CATEGORIES.join(', ')}.`);
    }

    return this.repository.createJobPhotos(jobId, category, urls, {
      id: user?.id,
      name: user?.name,
      franchiseId: user?.franchiseId || job.franchiseId,
    });
  }

  async listJobPhotos(jobId: string) {
    const job = await this.repository.findById(jobId);
    if (!job) throw new NotFoundError("Job card not found");
    return this.repository.listJobPhotos(jobId);
  }

  // ─── Work Notes (10.9) ────────────────────────────────────────────────────

  async addWorkNote(jobId: string, note: string, user?: { id?: string; name?: string; role?: string; franchiseId?: string | null }) {
    await this.checkTechnicianAccess(jobId, user);
    const job = await this.repository.findById(jobId);
    if (!job) throw new NotFoundError("Job card not found");

    return this.repository.createWorkNote(jobId, note, {
      id: user?.id,
      name: user?.name,
      franchiseId: user?.franchiseId || job.franchiseId,
    });
  }

  async listWorkNotes(jobId: string) {
    const job = await this.repository.findById(jobId);
    if (!job) throw new NotFoundError("Job card not found");
    return this.repository.listWorkNotes(jobId);
  }

  // ─── Material Consumption (10.8) ──────────────────────────────────────────

  async recordMaterialConsumption(
    jobId: string,
    data: { itemId: string; quantity: number; unit?: string },
    user?: { id?: string; name?: string; role?: string; franchiseId?: string | null }
  ) {
    await this.checkTechnicianAccess(jobId, user);
    const job = await this.repository.findById(jobId);
    if (!job) throw new NotFoundError("Job card not found");

    const item = await db.inventory.findFirst({ where: { id: data.itemId } });
    if (!item) throw new NotFoundError("Inventory item not found");

    const record = await this.repository.createMaterialConsumption(jobId, {
      itemId: item.id,
      itemName: item.name,
      quantity: data.quantity,
      unit: data.unit || item.unit,
      recordedById: user?.id || null,
      recordedBy: user?.name || null,
      franchiseId: user?.franchiseId || job.franchiseId,
    });

    notifyMaterialRequestPending({
      franchiseId: job.franchiseId,
      jobId,
      vehicle: job.vehicle,
      itemName: item.name,
      quantity: data.quantity,
    }).catch(console.error);

    return record;
  }

  async listMaterialConsumptions(jobId: string) {
    const job = await this.repository.findById(jobId);
    if (!job) throw new NotFoundError("Job card not found");
    return this.repository.listMaterialConsumptions(jobId);
  }

  async resolveMaterialConsumption(
    id: string,
    data: { status: 'Approved' | 'Rejected'; rejectionNote?: string | null },
    user?: { id?: string; name?: string; role?: string }
  ) {
    const userRole = normalizeRole(user?.role);
    if (!MANAGEMENT_ROLES.includes(userRole)) {
      throw new ForbiddenError("Only authorized management may approve or reject material consumption.");
    }

    const record = await this.repository.findMaterialConsumptionById(id);
    if (!record) throw new NotFoundError("Material consumption record not found");
    if (record.status !== 'Pending') {
      throw new ValidationError(`This material consumption has already been ${record.status.toLowerCase()}.`);
    }

    if (data.status === 'Approved') {
      // 10.8: "Inventory shall be updated automatically after approval"
      await new InventoryService().consumeItem(record.itemId, record.quantity, record.jobId, user?.id || 'unknown');
    }

    return this.repository.updateMaterialConsumption(id, {
      status: data.status,
      approvedById: user?.id || null,
      approvedBy: user?.name || null,
      rejectionNote: data.rejectionNote,
    });
  }

  // ─── Completion Request (10.10) ───────────────────────────────────────────

  async requestCompletion(jobId: string, user?: { id?: string; name?: string; role?: string }) {
    const job = await this.repository.findById(jobId);
    if (!job) throw new NotFoundError("Job card not found");

    const userRole = normalizeRole(user?.role);
    const isManagement = MANAGEMENT_ROLES.includes(userRole);
    if (userRole === 'TECHNICIAN' && !isManagement) {
      if (!user?.id || job.technicianId !== user.id) {
        throw new ForbiddenError("Only the Primary Responsible Employee may submit this job for Quality Control.");
      }
    }

    const updated = await this.repository.update(jobId, { status: 'Waiting for Quality Check' });

    notifyWorkCompletion({
      franchiseId: job.franchiseId,
      jobId,
      vehicle: job.vehicle,
      customerName: job.customer,
    }).catch(console.error);

    return updated;
  }
}
