import { JobCardRepository } from '../repository/job-card.repository.js';
import type { CreateJobCardDTO, UpdateJobCardDTO } from '../validation/job-card.validation.js';
import { generateSequentialId } from '../../../shared/utils/idGenerator.js';

export class JobCardService {
  constructor(private readonly repository: JobCardRepository = new JobCardRepository()) { }

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
