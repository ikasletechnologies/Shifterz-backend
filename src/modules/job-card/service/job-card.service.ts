import { JobCardRepository } from '../repository/job-card.repository.js';
import type { CreateJobCardDTO, UpdateJobCardDTO, QcChecklistDTO } from '../validation/job-card.validation.js';
import { generateSequentialId } from '../../../shared/utils/idGenerator.js';
import { COMPLETED_JOB_STATUSES } from '../../../shared/constants/jobStatus.constants.js';

import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError.js';

const QC_TRANSITION_STATUSES = ["Inspecting", "QC Passed", "QC Failed", "Rework"];

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

  async createJob(data: CreateJobCardDTO) {
    const jobId = await generateSequentialId("JOB");

    let techId = data.technicianId || null;
    if (!techId && data.technician) {
      const techRecord = await this.repository.findEmployeeByName(data.technician);
      if (techRecord) techId = techRecord.id;
    }

    return this.repository.create(jobId, data, techId);
  }

  async updateJob(id: string, data: UpdateJobCardDTO, user?: { id?: string; name?: string }) {
    const enriched: any = { ...data };

    if (data.status) {
      if (QC_TRANSITION_STATUSES.includes(data.status) && user?.id) {
        enriched.qcById = user.id;
        enriched.qcBy = user.name || "";
      }
      if (data.status === "QC Passed") enriched.passedAt = new Date().toISOString();
      if (data.status === "QC Failed") enriched.failedAt = new Date().toISOString();
      if (data.status === "Rework") {
        enriched.isRework = true;
        enriched.reworkCount = { increment: 1 };
      }
      if (COMPLETED_JOB_STATUSES.includes(data.status)) {
        enriched.actualCompletion = new Date().toISOString();
      }
    }

    return this.repository.update(id, enriched);
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
}
