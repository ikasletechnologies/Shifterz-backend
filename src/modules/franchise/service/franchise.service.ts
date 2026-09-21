import { FranchiseRepository } from '../repository/franchise.repository.js';
import type { CreateFranchiseDTO, UpdateFranchiseDTO } from '../validation/franchise.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ApiError } from '../../../shared/errors/ApiError.js';
import { db } from '../../../lib/db.js';

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

  // EPB §3.5 (Section 3 Finding 1 remediation) — this used to create a
  // db.approval row ("Pending") that nothing anywhere in the codebase ever
  // processed into a real franchise; a genuine dead end duplicating
  // POST /api/hq/franchises, which already implements the real Franchise
  // Activation Request workflow (Pending Franchise + License, approved or
  // rejected only by SUPER_ADMIN via /hq/franchises/:id/approve|reject).
  // One authoritative path, not two competing ones — this route now points
  // callers at it instead of silently accepting a request nothing acts on.
  async createFranchise(_data: CreateFranchiseDTO, _requesterId = "HQ", _requesterName = "HQ Admin"): Promise<never> {
    throw new ApiError(400, "Franchise creation must go through the Franchise Activation Request workflow at POST /api/hq/franchises (approved or rejected via /api/hq/franchises/:id/approve or /reject).");
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
