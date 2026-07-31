import { JobCardRepository } from '../repository/job-card.repository.js';
import type { CreateJobCardDTO, UpdateJobCardDTO } from '../validation/job-card.validation.js';
import { generateSequentialId } from '../../../shared/utils/idGenerator.js';

import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError.js';

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

  async updateJob(id: string, data: UpdateJobCardDTO) {
    return this.repository.update(id, data);
  }

  async deleteJob(id: string) {
    return this.repository.softDelete(id);
  }
}
