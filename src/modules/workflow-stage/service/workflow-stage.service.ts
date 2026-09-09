import { WorkflowStageRepository } from '../repository/workflow-stage.repository.js';
import type { CreateWorkflowStageDTO, UpdateWorkflowStageDTO } from '../validation/workflow-stage.validation.js';
import { NotFoundError } from '../../../shared/errors/NotFoundError.js';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError.js';
import { resolveDataScope, assertWithinScope, type ScopeActor } from '../../../shared/scope/dataScope.js';

const HQ_ROLES = ['SUPER_ADMIN', 'HQ_USER'];
const normalizeRole = (role?: string) => (role || '').toUpperCase().replace(/[\s_]+/g, '_');

export class WorkflowStageService {
  constructor(private readonly repository: WorkflowStageRepository = new WorkflowStageRepository()) {}

  async getAllStages(franchiseId: string | null) {
    return this.repository.findAll(franchiseId);
  }

  async createStage(data: CreateWorkflowStageDTO, user?: { role?: string; franchiseId?: string | null }) {
    const isHq = HQ_ROLES.includes(normalizeRole(user?.role));
    // HQ may create a global stage (franchiseId omitted) or one scoped to any franchise.
    // Non-HQ users may only create a stage scoped to their own franchise.
    if (!isHq) {
      if (!user?.franchiseId) {
        throw new ForbiddenError("Only HQ may create a global workflow stage.");
      }
      data = { ...data, franchiseId: user.franchiseId };
    }
    return this.repository.create(data);
  }

  // D-17 — tenant-isolation fix: these previously had no franchise-scope
  // check at all, so any authenticated user could modify or delete any
  // workflow stage, including other franchises' or HQ's global (null
  // franchiseId) ones. This is a Phase 1A data-scope concern, independent of
  // which role should be allowed to administer stages (that's RBAC-04).
  async updateStage(id: string, data: UpdateWorkflowStageDTO, actor?: ScopeActor) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundError("Workflow stage not found");
    assertWithinScope(resolveDataScope(actor), existing.franchiseId, "Workflow stage not found");
    return this.repository.update(id, data);
  }

  async deleteStage(id: string, actor?: ScopeActor) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundError("Workflow stage not found");
    assertWithinScope(resolveDataScope(actor), existing.franchiseId, "Workflow stage not found");
    if (existing.isDefault) {
      throw new ForbiddenError("Default workflow stages cannot be removed.");
    }
    return this.repository.softDelete(id);
  }
}
