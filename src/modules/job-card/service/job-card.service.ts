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
import { resolveDataScope, scopeWhere, type ScopeActor } from '../../../shared/scope/dataScope.js';
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
// Mirrors qc.service.ts's QC_ROLES — kept as a separate constant here rather
// than importing from the qc module, matching this file's existing pattern
// of not cross-importing between modules for a handful of role literals.
const QC_ROLES = ['QUALITY_INSPECTOR', 'QUALITY_INSPECTION', 'QC_INSPECTOR', 'QC', 'QUALITY_ASSURANCE'];
const normalizeRole = (role?: string) => (role || '').toUpperCase().replace(/[\s_]+/g, '_');

export class JobCardService {
  constructor(private readonly repository: JobCardRepository = new JobCardRepository()) { }

  // Franchise-scope-only fetch: the database query itself excludes jobs
  // outside the actor's franchise (see resolveDataScope/scopeWhere). Used by
  // every read/write job-card endpoint that doesn't additionally restrict a
  // TECHNICIAN to only their own assigned jobs. A 404, not a 403, is
  // returned for an out-of-scope id so existence elsewhere isn't confirmed.
  async findScopedJob(jobId: string, user?: ScopeActor) {
    const scope = resolveDataScope(user);
    const job = await this.repository.findById(jobId, scopeWhere(scope));
    if (!job) throw new NotFoundError("Job card not found");
    return job;
  }

  // Same franchise-scope enforcement as findScopedJob, plus the existing
  // TECHNICIAN-identity restriction for endpoints that mutate a job's
  // assignment/work state (the set that already called checkTechnicianAccess
  // before this fix).
  async getScopedJob(jobId: string, user?: ScopeActor & { id?: string; name?: string }) {
    const job = await this.findScopedJob(jobId, user);

    const userRole = (user?.role || "").toUpperCase().replace(/[\s_]+/g, "_");
    if (userRole === "TECHNICIAN") {
      const userId = user?.id;
      const userName = user?.name ? user.name.trim().toLowerCase() : "";

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

    return job;
  }

  // Preserved for existing call sites that only need the access check, not
  // the job payload itself.
  async checkTechnicianAccess(jobId: string, user?: ScopeActor & { id?: string; name?: string }) {
    await this.getScopedJob(jobId, user);
  }

  async getJobs(filter: any) {
    return this.repository.findAll(filter);
  }

  async createJob(data: CreateJobCardDTO, user?: ScopeActor & { id?: string; name?: string }) {
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

    // franchiseId is always server-derived from the actor, never accepted
    // from the request body — the create DTO doesn't even carry the field.
    const scope = resolveDataScope(user);
    const franchiseId = scope.unrestricted ? null : scope.franchiseId;

    const createdJob = await this.repository.create(jobId, data, techId, franchiseId);

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

  async updateJob(id: string, data: UpdateJobCardDTO, user?: ScopeActor & { id?: string; name?: string }) {
    const job = await this.getScopedJob(id, user);

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
      // Step 3 Item #4 — QC status transitions must go exclusively through
      // the canonical POST /api/qc/:jobId/decision endpoint (and its
      // checklist/photo/assign siblings), for every role including
      // management. This generic edit path must never be a second way to
      // reach `passedAt`/`failedAt`, which billing.service.ts trusts
      // unconditionally as proof of QC approval.
      if (QC_TRANSITION_STATUSES.includes(data.status)) {
        throw new ValidationError(
          `"${data.status}" is a QC-controlled status and cannot be set through this endpoint. Use the QC module (POST /api/qc/:jobId/decision) to record a Pass/Fail decision.`
        );
      }

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

      if (COMPLETED_JOB_STATUSES.includes(data.status)) {
        enriched.actualCompletion = new Date().toISOString();
      }
    }

    // ── Rule 5: Price and warranty modifications require authorization ──────
    const canonicalizeService = (item: any) => {
      if (typeof item !== 'object' || item === null) {
        return String(item);
      }
      return JSON.stringify({
        name: item.name || item.code || '',
        price: Number(item.price) || 0,
        warranty: item.warranty || ''
      });
    };

    const haveServicesChanged = (oldVal: any, newVal: any): boolean => {
      if (oldVal === newVal) return false;
      if (!oldVal || !newVal) return true;

      let oldArr: any[] = [];
      let newArr: any[] = [];

      try {
        oldArr = typeof oldVal === 'string' ? JSON.parse(oldVal) : (Array.isArray(oldVal) ? oldVal : [oldVal]);
      } catch {
        oldArr = [oldVal];
      }

      try {
        newArr = typeof newVal === 'string' ? JSON.parse(newVal) : (Array.isArray(newVal) ? newVal : [newVal]);
      } catch {
        newArr = [newVal];
      }

      if (oldArr.length !== newArr.length) return true;

      const oldCanon = oldArr.map(canonicalizeService).sort();
      const newCanon = newArr.map(canonicalizeService).sort();

      for (let i = 0; i < oldCanon.length; i++) {
        if (oldCanon[i] !== newCanon[i]) return true;
      }
      return false;
    };

    const isPriceOrWarrantyChange = data.services !== undefined && haveServicesChanged(job.services, data.services);
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

  // Step 3 Item #4 — this writes to Job.checklist directly, a separate field
  // from the canonical qc module's QCInspection.checklist. Re-gated to the
  // same QC_ROLES/MANAGEMENT_ROLES tier as the canonical endpoint rather than
  // merged into it, since merging would silently move where this data is
  // stored without confirming nothing still reads Job.checklist directly.
  async submitChecklist(id: string, checklist: QcChecklistDTO['checklist'], user?: ScopeActor) {
    await this.findScopedJob(id, user);
    if (!MANAGEMENT_ROLES.includes(normalizeRole(user?.role)) && !QC_ROLES.includes(normalizeRole(user?.role))) {
      throw new ForbiddenError("Only an authorized Quality Inspector or management may submit a QC checklist.");
    }
    return this.repository.updateChecklist(id, checklist);
  }

  // Same reasoning as submitChecklist above — Job.qcPhotos is a separate
  // field from the canonical qc module's JobPhoto rows.
  async appendQcPhotos(id: string, urls: string[], user?: ScopeActor) {
    await this.findScopedJob(id, user);
    if (!MANAGEMENT_ROLES.includes(normalizeRole(user?.role)) && !QC_ROLES.includes(normalizeRole(user?.role))) {
      throw new ForbiddenError("Only an authorized Quality Inspector or management may upload QC photos.");
    }
    return this.repository.appendQcPhotos(id, urls);
  }

  async deleteJob(id: string, user?: ScopeActor & { id?: string; name?: string }) {
    await this.getScopedJob(id, user);
    return this.repository.softDelete(id);
  }

  // ─── Job Details (with Additional Works) ─────────────────────────────────────

  async getJobWithDetails(id: string, user?: ScopeActor & { id?: string; name?: string }) {
    const scope = resolveDataScope(user);
    const job = await this.repository.getWithDetails(id, scopeWhere(scope));
    if (!job) throw new NotFoundError("Job card not found");
    return job;
  }

  // ─── Job History ──────────────────────────────────────────────────────────────

  async getJobHistory(id: string, user?: ScopeActor) {
    await this.findScopedJob(id, user);
    return this.repository.getHistory(id);
  }

  // ─── Additional Work ─────────────────────────────────────────────────────────

  async requestAdditionalWork(
    jobId: string,
    data: { description: string; estimatedCost: number },
    user?: ScopeActor & { id?: string; name?: string }
  ) {
    const job = await this.findScopedJob(jobId, user);
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
    user?: ScopeActor & { id?: string; name?: string }
  ) {
    // Only management can approve/reject additional work
    const userRole = normalizeRole(user?.role);
    if (!MANAGEMENT_ROLES.includes(userRole)) {
      throw new ForbiddenError("Only authorized management may approve or reject additional work.");
    }

    const scope = resolveDataScope(user);
    const existing = await db.additionalWork.findFirst({ where: { id, isDeleted: false, ...scopeWhere(scope) } });
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

  async listAdditionalWorks(jobId: string, user?: ScopeActor) {
    await this.findScopedJob(jobId, user);
    return this.repository.listAdditionalWorks(jobId);
  }

  // ─── Work Stage (10.5) ────────────────────────────────────────────────────

  async updateWorkStage(jobId: string, stage: string, notes: string | undefined, user?: ScopeActor & { id?: string; name?: string }) {
    const job = await this.getScopedJob(jobId, user);

    const workflowStage = await this.repository.findWorkflowStage(stage, job.franchiseId);
    if (!workflowStage) {
      throw new ValidationError(`"${stage}" is not a configured work stage. Ask HQ to add it if it's new.`);
    }

    return this.repository.update(jobId, { status: workflowStage.name, ...(notes ? { notes } : {}) });
  }

  // ─── Work Photographs (10.6) ──────────────────────────────────────────────

  async uploadJobPhotos(jobId: string, category: string, urls: string[], user?: ScopeActor & { id?: string; name?: string }) {
    const job = await this.getScopedJob(jobId, user);

    if (!(JOB_PHOTO_CATEGORIES as readonly string[]).includes(category)) {
      throw new ValidationError(`Invalid photo category "${category}". Must be one of: ${JOB_PHOTO_CATEGORIES.join(', ')}.`);
    }

    return this.repository.createJobPhotos(jobId, category, urls, {
      id: user?.id,
      name: user?.name,
      franchiseId: user?.franchiseId || job.franchiseId,
    });
  }

  async listJobPhotos(jobId: string, user?: ScopeActor) {
    await this.findScopedJob(jobId, user);
    return this.repository.listJobPhotos(jobId);
  }

  // ─── Work Notes (10.9) ────────────────────────────────────────────────────

  async addWorkNote(jobId: string, note: string, user?: ScopeActor & { id?: string; name?: string }) {
    const job = await this.getScopedJob(jobId, user);

    return this.repository.createWorkNote(jobId, note, {
      id: user?.id,
      name: user?.name,
      franchiseId: user?.franchiseId || job.franchiseId,
    });
  }

  async listWorkNotes(jobId: string, user?: ScopeActor) {
    await this.findScopedJob(jobId, user);
    return this.repository.listWorkNotes(jobId);
  }

  // ─── Material Consumption (10.8) ──────────────────────────────────────────

  async recordMaterialConsumption(
    jobId: string,
    data: { itemId: string; quantity: number; unit?: string },
    user?: ScopeActor & { id?: string; name?: string }
  ) {
    const job = await this.getScopedJob(jobId, user);

    // INV-02 — franchise-ownership check. This lookup used to be unscoped,
    // so a technician could record consumption against any inventory item
    // id — another franchise's, or HQ's — and once management approved the
    // record, consumeItem() would silently decrement that other tenant's
    // stock. Scoped the same way every other item lookup in this codebase
    // is (resolveDataScope/scopeWhere), so an out-of-scope itemId can never
    // enter a JobMaterialConsumption record in the first place.
    const scope = resolveDataScope(user);
    const item = await db.inventory.findFirst({ where: { id: data.itemId, ...scopeWhere(scope) } });
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

  async listMaterialConsumptions(jobId: string, user?: ScopeActor) {
    await this.findScopedJob(jobId, user);
    return this.repository.listMaterialConsumptions(jobId);
  }

  async resolveMaterialConsumption(
    id: string,
    data: { status: 'Approved' | 'Rejected'; rejectionNote?: string | null },
    user?: ScopeActor & { id?: string; name?: string }
  ) {
    const userRole = normalizeRole(user?.role);
    if (!MANAGEMENT_ROLES.includes(userRole)) {
      throw new ForbiddenError("Only authorized management may approve or reject material consumption.");
    }

    const scope = resolveDataScope(user);
    const record = await this.repository.findMaterialConsumptionById(id, scopeWhere(scope));
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

  async requestCompletion(jobId: string, user?: ScopeActor & { id?: string; name?: string }) {
    const job = await this.findScopedJob(jobId, user);

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
