import { FranchiseRepository } from '../repository/franchise.repository.js';
import type { CreateFranchiseDTO, UpdateFranchiseDTO } from '../validation/franchise.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { db } from '../../../lib/db.js';
import { sendNotification } from '../../../shared/services/notification.service.js';

export class FranchiseService {
  constructor(private readonly repository: FranchiseRepository = new FranchiseRepository()) {}

  async getAllFranchises() {
    return this.repository.findAll();
  }

  async getFranchiseById(id: string) {
    const franchise = await this.repository.findById(id);
    if (!franchise) {
      throw new NotFoundError("Franchise not found");
    }
    return franchise;
  }

  async createFranchise(data: CreateFranchiseDTO, requesterId = "HQ", requesterName = "HQ Admin") {
    const approval = await db.approval.create({
      data: {
        module: "FRANCHISE",
        targetId: "NEW",
        requesterId,
        requesterName,
        status: "Pending",
        payload: data as any,
      }
    });

    await sendNotification("HQ", "New Franchise Request", `Franchise activation request submitted for ${data.name} by ${requesterName}.`);
    return approval;
  }

  async updateFranchise(id: string, data: UpdateFranchiseDTO) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Franchise not found");
    }
    return this.repository.update(id, data);
  }

  async deleteFranchise(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw new NotFoundError("Franchise not found");
    }
    return this.repository.softDelete(id);
  }
}
