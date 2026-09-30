import { ServiceRepository } from '../repository/service.repository.js';
import type { CreateServiceDTO, UpdateServiceDTO } from '../validation/service.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';

export class ServiceService {
  constructor(private readonly repository: ServiceRepository = new ServiceRepository()) {}

  async getAllServices(status?: string) {
    return this.repository.findAll(status);
  }

  async getServiceById(id: string) {
    const service = await this.repository.findById(id);
    if (!service) {
      throw new NotFoundError("Service not found");
    }
    return service;
  }

  async createService(data: CreateServiceDTO) {
    const serviceId = generateUid("SRV");
    return this.repository.create(serviceId, data);
  }

  async updateService(id: string, data: UpdateServiceDTO) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Service not found");
    }
    return this.repository.update(id, data);
  }

  async deleteService(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Service not found");
    }
    return this.repository.softDelete(id);
  }
}
