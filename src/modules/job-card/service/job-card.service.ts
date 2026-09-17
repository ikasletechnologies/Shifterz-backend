import { JobCardRepository } from '../repository/job-card.repository.js';
import type { CreateJobCardDTO, UpdateJobCardDTO } from '../validation/job-card.validation.js';
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

const QC_TRANSITION_STATUSES = ["Inspecting", "QC Passed", "QC Failed", "Rework", "Rework Required", "Ready For Billing"];
const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'HQ_USER', 'FRANCHISE_ADMIN', 'BRANCH_MANAGER'];
const QC_ROLES = ['QUALITY_INSPECTOR', 'QUALITY_INSPECTION', 'QC_INSPECTOR', 'QC', 'QUALITY_ASSURANCE'];
const normalizeRole = (role?: string) => (role || '').toUpperCase().replace(/[\s_]+/g, '_');

export class JobCardService {
  constructor(private readonly repository: JobCardRepository = new JobCardRepository()) { }

  async findScopedJob(jobId: string, user?: ScopeActor) {
    const scope = resolveDataScope(user);
    const job = await this.repository.findById(jobId, scopeWhere(scope));
    if (!job) throw new NotFoundError("Job card not found");
    return job;
  }

  async getScopedJob(jobId: string, user?: ScopeActor & { id?: string; name?: string }) {
    const job = await this.findScopedJob(jobId, user);

    const userRole = normalizeRole(user?.role);
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

  async checkTechnicianAccess(jobId: string, user?: ScopeActor & { id?: string; name?: string }) {
    await this.getScopedJob(jobId, user);
  }

  async getJobs(filter: any) {
    return this.repository.findAll(filter);
  }

  // supportingTechnicianIds: Accepted in DTO and persisted to DB.
  // No active business logic currently depends on it (zero frontend or service usage).
  // Validation is deferred until this feature is activated in a future phase.

  private async validateTechnician(techIdOrName: { id?: string | null; name?: string | null }, userFranchiseId?: string | null) {
    let emp: any = null;
    if (techIdOrName.id) {
      // Technician must exist, not be soft-deleted, and be Active
      emp = await db.employee.findFirst({ where: { id: techIdOrName.id, isDeleted: false, status: 'Active' } });
      if (!emp) throw new ValidationError("Assigned technician not found or is not active.");
    } else if (techIdOrName.name && techIdOrName.name.trim() !== "" && techIdOrName.name.trim().toLowerCase() !== "unassigned") {
      emp = await db.employee.findFirst({ where: { name: techIdOrName.name.trim(), isDeleted: false, status: 'Active' } });
    }

    if (emp && userFranchiseId && emp.franchiseId && emp.franchiseId !== userFranchiseId) {
      throw new ValidationError("Assigned technician does not belong to your franchise.");
    }

    return emp;
  }

  // Estimate rule (Option B — Estimate is optional):
  // The db.estimate model is created manually by service advisors; it is NOT auto-generated
  // from the CarIn/check-in flow. Many jobs will legitimately have NO estimate (e.g., standard
  // maintenance, internal jobs, or jobs pre-approved verbally). The business rule is therefore:
  //   - No estimate present  → ALLOWED (standard workflow)
  //   - Estimate present and Approved → ALLOWED
  //   - Estimate present and Pending  → BLOCKED (customer has not approved)
  //   - Estimate present and Rejected → BLOCKED (customer rejected; work should not proceed)
  // Returns the carInId that was verified (non-null) so the caller can emit INSPECTION_COMPLETED.
  private async validateInspectionAndEstimate(job: { id: string; vehicle: string; carInId?: string | null }): Promise<{ inspectedCarInId: string | null }> {
    // 1. Vehicle Inspection validation
    let carIn = null;
    if (job.carInId) {
      carIn = await db.carIn.findFirst({ where: { id: job.carInId, isDeleted: false } });
    }
    if (!carIn) {
      carIn = await db.carIn.findFirst({ where: { jobCardId: job.id, isDeleted: false } });
    }

    let inspectedCarInId: string | null = null;

    if (carIn) {
      // At least one truthy condition field AND at least one truthy photo are both required.
      // Empty strings (e.g., scratches = "") are treated as falsy and do NOT satisfy the requirement.
      const hasInspectionDetails = Boolean(
        carIn.scratches || carIn.dents || carIn.interiorCondition || carIn.brokenParts || carIn.glassDamage || carIn.wheelDamage || carIn.remarks || carIn.fuelLevel
      );
      const hasPhoto = Boolean(
        carIn.photoFront || carIn.photoRear || carIn.photoLeft || carIn.photoRight || carIn.photoDashboard || carIn.photoOdometer || (carIn.photoDamages && carIn.photoDamages.length > 0)
      );

      if (!hasInspectionDetails || !hasPhoto) {
        throw new ValidationError(
          "Initial vehicle inspection details and at least one vehicle photograph must be recorded before work can begin or complete."
        );
      }

      inspectedCarInId = carIn.id;
    }

    // 2. Estimate check (Option B — optional estimate):
    // Only block if an estimate EXISTS and is NOT Approved.
    // No estimate → ALLOWED.
    const estimate = await db.estimate.findFirst({
      where: { vehicle: job.vehicle, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    if (estimate && estimate.status !== 'Approved') {
      throw new ValidationError(
        `An estimate exists for vehicle ${job.vehicle} but is not approved (current status: "${estimate.status}"). Please obtain customer estimate approval.`
      );
    }

    return { inspectedCarInId };
  }

  async createJob(data: CreateJobCardDTO, user?: ScopeActor & { id?: string; name?: string }) {
    const scope = resolveDataScope(user);
    const franchiseId = scope.unrestricted ? null : scope.franchiseId;

    // DB-level 1-to-1 check for carInId
    if (data.carInId) {
      const existingJob = await db.job.findFirst({
        where: { carInId: data.carInId, isDeleted: false }
      });
      if (existingJob) return existingJob;
    }

    // Check estimate status rule
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

    // Technician validation
    let techId = data.technicianId || null;
    let techName = data.technician || null;

    if (techId || techName) {
      const emp = await this.validateTechnician({ id: techId || undefined, name: techName || undefined }, franchiseId);
      if (emp) {
        techId = emp.id;
        techName = emp.name;
      }
    }

    // Attempt creation with DB sequence + retry on P2002 collision
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      const jobId = await generateSequentialId("JOB");

      try {
        const createdJob = await db.$transaction(async (tx) => {
          const job = await tx.job.create({
            data: {
              id: jobId,
              vehicle: data.vehicle,
              customer: data.customer || "",
              service: data.service || "",
              services: data.services || null,
              technician: techName || "",
              technicianId: techId,
              serviceAdvisor: data.serviceAdvisor || "",
              serviceAdvisorId: data.serviceAdvisorId || null,
              status: data.status || "Pending",
              priority: data.priority ?? "",
              startDate: data.startDate ? new Date(data.startDate) : new Date(),
              estCompletion: data.estCompletion ? new Date(data.estCompletion) : new Date(),
              notes: data.notes || "",
              remarks: data.remarks || null,
              carInId: data.carInId || null,
              photos: data.photos || [],
              customerSignature: data.customerSignature || null,
              companyAcknowledgement: data.companyAcknowledgement || null,
              franchiseId,
            }
          });

          await tx.jobHistory.create({
            data: {
              jobId: job.id,
              event: 'CREATED',
              performedBy: user?.id || 'SYSTEM',
              payload: {
                vehicle: job.vehicle,
                customer: job.customer,
                status: job.status,
              },
            },
          });

          if (data.carInId) {
            await tx.carIn.updateMany({
              where: { id: data.carInId },
              data: { jobCardId: job.id },
            });
          }

          return job;
        });

        return createdJob;
      } catch (err: any) {
        if (err.code === 'P2002') {
          // If collision on carInId, return existing Job idempotently
          if (data.carInId) {
            const existingJob = await db.job.findFirst({
              where: { carInId: data.carInId, isDeleted: false }
            });
            if (existingJob) return existingJob;
          }
          // If collision on jobId, loop to try next candidate sequence ID
          if (attempts >= 3) throw err;
        } else {
          throw err;
        }
      }
    }

    throw new ValidationError("Failed to generate a unique Job Card number after multiple retries.");
  }

  async updateJob(id: string, data: UpdateJobCardDTO, user?: ScopeActor & { id?: string; name?: string }) {
    const job = await this.getScopedJob(id, user);

    const userRole = normalizeRole(user?.role);
    const isHq = userRole === "SUPER_ADMIN" || userRole === "HQ_USER";

    const isAssigneeChange = (data.technicianId !== undefined && data.technicianId !== job.technicianId) ||
      (data.technician !== undefined && data.technician !== job.technician) ||
      (data.serviceAdvisorId !== undefined && data.serviceAdvisorId !== job.serviceAdvisorId) ||
      (data.serviceAdvisor !== undefined && data.serviceAdvisor !== job.serviceAdvisor);

    if (job.assignmentLocked && isAssigneeChange && !isHq) {
      throw new ForbiddenError("This job assignment is locked by HQ and cannot be modified by the franchise.");
    }

    const scope = resolveDataScope(user);
    const franchiseId = scope.unrestricted ? null : scope.franchiseId;

    if (isAssigneeChange && (data.technicianId || data.technician)) {
      const emp = await this.validateTechnician({ id: data.technicianId, name: data.technician }, franchiseId);
      if (emp) {
        data.technicianId = emp.id;
        data.technician = emp.name;
      }
    }

    const enriched: any = { ...data };

    if (isHq && isAssigneeChange) {
      enriched.assignmentLocked = true;
      enriched.assignedBy = user?.id || "HQ";
      enriched.assignedByRole = userRole;
    }

    // Track gate results for history events emitted after update
    let inspectedCarInId: string | null = null;
    const workActiveStatuses = ['Work In Progress', 'Job Assigned', 'In Progress'];

    if (data.status) {
      if (QC_TRANSITION_STATUSES.includes(data.status)) {
        throw new ValidationError(
          `"${data.status}" is a QC-controlled status and cannot be set through this endpoint. Use the QC module (POST /api/qc/:jobId/decision) to record a Pass/Fail decision.`
        );
      }

      if (workActiveStatuses.includes(data.status)) {
        const gateResult = await this.validateInspectionAndEstimate(job);
        inspectedCarInId = gateResult.inspectedCarInId;

        // Check assigned technician
        const currentTechId = data.technicianId ?? job.technicianId;
        const currentTech = data.technician ?? job.technician;
        if (!currentTechId && (!currentTech || currentTech.trim().toLowerCase() === "unassigned")) {
          throw new ValidationError("A valid assigned technician is required before starting work.");
        }
      }

      const completionStatuses = ['Waiting for Quality Check', 'Work Completed'];
      if (completionStatuses.includes(data.status)) {
        // Must be coming from active work status — except "Waiting for Quality
        // Check", which a job in "Rework Required" must also be able to reach
        // so a technician can resubmit reworked jobs back into the QC queue
        // (Phase 4A: this transition was previously blocked entirely), and
        // which a job already marked "Completed" (the Workshop module's
        // intermediate "Complete Work" step, set outside this gate) must also
        // be able to reach via the subsequent "Send to QC" action.
        const allowedSourceStatuses = data.status === 'Waiting for Quality Check'
          ? [...workActiveStatuses, 'Rework Required', 'Completed']
          : workActiveStatuses;
        if (!allowedSourceStatuses.includes(job.status)) {
          throw new ValidationError(
            `Cannot set status to "${data.status}" from "${job.status}". Work must be in progress before completing.`
          );
        }

        const gateResult = await this.validateInspectionAndEstimate(job);
        inspectedCarInId = gateResult.inspectedCarInId;

        // Additional Work completion model:
        // AdditionalWork.status = 'Approved' means customer-authorized work.
        // There is currently no separate 'Completed' state.
        // The existing workflow assumes approved additional work has been performed
        // when the parent Job reaches "Waiting for Quality Check". This is by design.
        // Only 'Pending' AdditionalWork blocks completion.
        // If a separate completion audit is needed in a future phase, add AdditionalWork.completedAt.

        // Inspect AdditionalWork records
        const pendingAddWorks = await db.additionalWork.findMany({
          where: { jobId: id, isDeleted: false }
        });

        const hasPending = pendingAddWorks.some(aw => aw.status === 'Pending');
        if (hasPending) {
          throw new ValidationError("Cannot complete job while pending additional work requests exist.");
        }

        const unconfirmedApproved = pendingAddWorks.some(aw => aw.status === 'Approved' && aw.customerApproved !== true);
        if (unconfirmedApproved) {
          throw new ValidationError("Cannot complete job while approved additional work lacks customer approval.");
        }

        // Inspect MaterialConsumption records
        const pendingMaterials = await db.materialConsumption.findMany({
          where: { jobId: id, isDeleted: false, status: 'Pending' }
        });
        if (pendingMaterials.length > 0) {
          throw new ValidationError("Cannot complete job while pending material consumption requests exist.");
        }

        enriched.actualCompletion = new Date().toISOString();
      }
    }

    const canonicalizeService = (item: any) => {
      if (typeof item !== 'object' || item === null) return String(item);
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
      if (!userRole || !MANAGEMENT_ROLES.includes(userRole)) {
        throw new ForbiddenError("Only authorized management may modify service prices or warranty terms.");
      }
    }

    const updated = await this.repository.update(id, enriched);

    // JobHistory logging
    const historiesToCreate: any[] = [];
    const performedBy = user?.id || 'SYSTEM';

    if (data.status && data.status !== job.status) {
      // Emit a generic STATUS_CHANGED for all transitions not covered by a more specific event below.
      // WORK_STARTED and WORK_COMPLETED are emitted as dedicated semantic events; STATUS_CHANGED is
      // still written alongside them so timeline queries filtering on STATUS_CHANGED remain correct.
      historiesToCreate.push({
        jobId: id,
        event: data.status === 'QC Passed' ? 'QC_COMPLETED' :
          data.status === 'Delivered' ? 'VEHICLE_DELIVERED' : 'STATUS_CHANGED',
        performedBy,
        payload: { oldStatus: job.status, newStatus: data.status },
      });

      // WORK_STARTED — emitted when job enters any active-work status
      if (workActiveStatuses.includes(data.status) && !workActiveStatuses.includes(job.status)) {
        historiesToCreate.push({
          jobId: id,
          event: 'WORK_STARTED',
          performedBy,
          payload: {
            status: data.status,
            technicianId: data.technicianId ?? job.technicianId,
            technicianName: data.technician ?? job.technician,
          },
        });
      }

      // INSPECTION_COMPLETED — emitted when inspection passed the gate and work is starting
      if (workActiveStatuses.includes(data.status) && inspectedCarInId) {
        historiesToCreate.push({
          jobId: id,
          event: 'INSPECTION_COMPLETED',
          performedBy,
          payload: { carInId: inspectedCarInId },
        });
      }

      // WORK_COMPLETED — emitted when job reaches completion gate
      if (data.status === 'Waiting for Quality Check' || data.status === 'Work Completed') {
        historiesToCreate.push({
          jobId: id,
          event: 'WORK_COMPLETED',
          performedBy,
          payload: { completedAt: enriched.actualCompletion ?? new Date().toISOString() },
        });
      }
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
        event: 'PRICE_UPDATED',
        performedBy,
        payload: { oldServices: job.services, newServices: data.services },
      });
    }

    if (historiesToCreate.length > 0) {
      await db.jobHistory.createMany({ data: historiesToCreate });
    }

    // Auxiliary notifications (fire post-commit, non-blocking)
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

    if (data.status && data.status !== job.status && job.franchiseId) {
      notifyManagers(
        job.franchiseId,
        'Quality Control Status Update',
        `Job ${id} (${job.vehicle} – ${job.customer}) status updated to: ${data.status}.`
      ).catch(console.error);
    }

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

  async getJobWithDetails(id: string, user?: ScopeActor & { id?: string; name?: string }) {
    const scope = resolveDataScope(user);
    const job = await this.repository.getWithDetails(id, scopeWhere(scope));
    if (!job) throw new NotFoundError("Job card not found");
    return job;
  }

  async getJobHistory(id: string, user?: ScopeActor) {
    await this.findScopedJob(id, user);
    return this.repository.getHistory(id);
  }

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
    const userRole = normalizeRole(user?.role);
    if (!MANAGEMENT_ROLES.includes(userRole)) {
      throw new ForbiddenError("Only authorized management may approve or reject additional work.");
    }

    const scope = resolveDataScope(user);
    const existing = await db.additionalWork.findFirst({ where: { id, isDeleted: false, ...scopeWhere(scope) } });
    if (!existing) throw new NotFoundError("Additional work request not found");

    if (data.status === 'Approved' && data.customerApproved !== true) {
      throw new ValidationError("Customer approval must be confirmed before approving additional work.");
    }

    const updated = await db.$transaction(async (tx) => {
      const res = await tx.additionalWork.updateMany({
        where: { id, status: 'Pending', isDeleted: false, ...scopeWhere(scope) },
        data: {
          status: data.status,
          approvedById: user?.id || null,
          approvedBy: user?.name || null,
          approvedAt: new Date(),
          rejectionNote: data.rejectionNote || null,
          customerApproved: data.status === 'Approved' ? true : false,
        },
      });

      if (res.count === 0) {
        throw new ValidationError("Additional work request has already been resolved.");
      }

      if (data.status === 'Approved') {
        await tx.jobHistory.create({
          data: {
            jobId: existing.jobId,
            event: 'ADDITIONAL_WORK_APPROVED',
            performedBy: user?.id || 'SYSTEM',
            payload: { additionalWorkId: id, description: existing.description, cost: existing.estimatedCost },
          },
        });
      }

      if (data.status === 'Rejected') {
        await tx.jobHistory.create({
          data: {
            jobId: existing.jobId,
            event: 'ADDITIONAL_WORK_REJECTED',
            performedBy: user?.id || 'SYSTEM',
            payload: { additionalWorkId: id, description: existing.description, rejectionNote: data.rejectionNote || null },
          },
        });
      }

      return tx.additionalWork.findUnique({ where: { id } });
    });

    const job = await this.repository.findById(existing.jobId);
    if (job) {
      notifyAdditionalWorkApproval({
        jobId: existing.jobId,
        vehicle: job.vehicle,
        requestedById: existing.requestedById,
        status: data.status,
      }).catch(console.error);
    }

    return updated;
  }

  async listAdditionalWorks(jobId: string, user?: ScopeActor) {
    await this.findScopedJob(jobId, user);
    return this.repository.listAdditionalWorks(jobId);
  }

  async updateWorkStage(jobId: string, stage: string, notes: string | undefined, user?: ScopeActor & { id?: string; name?: string }) {
    const job = await this.getScopedJob(jobId, user);

    const workflowStage = await this.repository.findWorkflowStage(stage, job.franchiseId);
    if (!workflowStage) {
      throw new ValidationError(`"${stage}" is not a configured work stage. Ask HQ to add it if it's new.`);
    }

    return this.repository.update(jobId, { status: workflowStage.name, ...(notes ? { notes } : {}) });
  }

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

  async recordMaterialConsumption(
    jobId: string,
    data: { itemId: string; quantity: number; unit?: string },
    user?: ScopeActor & { id?: string; name?: string }
  ) {
    const job = await this.getScopedJob(jobId, user);

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

    return db.$transaction(async (tx) => {
      // Idempotency check: if the record is already in the requested terminal state,
      // return it as-is without re-decrementing stock or re-writing history.
      // This makes the operation safe to retry after a network timeout.
      const existing = await tx.materialConsumption.findFirst({
        where: { id, isDeleted: false, ...scopeWhere(scope) }
      });
      if (!existing) throw new NotFoundError("Material consumption record not found");

      // Idempotent retry: already in the exact requested state → return current record
      if (existing.status === data.status) {
        return existing;
      }

      // Already resolved to a DIFFERENT terminal state (e.g., Rejected → re-approve attempt)
      if (existing.status !== 'Pending') {
        throw new ValidationError(`Cannot change material consumption status from "${existing.status}" to "${data.status}". Record has already been resolved.`);
      }

      const updatedCount = await tx.materialConsumption.updateMany({
        where: {
          id,
          status: 'Pending',
          isDeleted: false,
          ...scopeWhere(scope),
        },
        data: {
          status: data.status,
          approvedById: user?.id || null,
          approvedBy: user?.name || null,
          approvedAt: new Date(),
          rejectionNote: data.rejectionNote || null,
        },
      });

      // Should not happen given the idempotency check above, but guard defensively
      if (updatedCount.count === 0) {
        throw new ValidationError("Material consumption could not be updated. Please retry.");
      }

      const record = await tx.materialConsumption.findUnique({ where: { id } });
      if (!record) throw new NotFoundError("Material consumption record not found");

      if (data.status === 'Approved') {
        // Atomic stock decrement + InventoryMovement inside same transaction
        // BEGIN ... stock decrement ... InventoryMovement ... JobHistory ... COMMIT
        // If stock is insufficient: ROLLBACK → status remains Pending, stock unchanged, no orphan records
        await new InventoryService().consumeItem(record.itemId, record.quantity, record.jobId, user?.id || 'unknown', tx);

        await tx.jobHistory.create({
          data: {
            jobId: record.jobId,
            event: 'MATERIAL_CONSUMED',
            performedBy: user?.id || 'SYSTEM',
            payload: { itemId: record.itemId, itemName: record.itemName, quantity: record.quantity },
          },
        });
      }

      return record;
    });
  }

  async requestCompletion(jobId: string, user?: ScopeActor & { id?: string; name?: string }) {
    const job = await this.findScopedJob(jobId, user);

    const userRole = normalizeRole(user?.role);
    const isManagement = MANAGEMENT_ROLES.includes(userRole);
    if (userRole === 'TECHNICIAN' && !isManagement) {
      if (!user?.id || job.technicianId !== user.id) {
        throw new ForbiddenError("Only the Primary Responsible Employee may submit this job for Quality Control.");
      }
    }

    return this.updateJob(jobId, { status: 'Waiting for Quality Check' }, user);
  }
}
