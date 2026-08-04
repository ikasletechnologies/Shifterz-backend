import { db } from '../../../lib/db.js';
import type { CreateWorkflowStageDTO, UpdateWorkflowStageDTO } from '../validation/workflow-stage.validation.js';

export class WorkflowStageRepository {
  async findAll(franchiseId: string | null) {
    return db.workflowStage.findMany({
      where: {
        isDeleted: false,
        OR: [{ franchiseId: null }, { franchiseId: franchiseId || undefined }],
      },
      orderBy: { order: 'asc' },
    });
  }

  async findById(id: string) {
    return db.workflowStage.findFirst({ where: { id, isDeleted: false } });
  }

  async create(data: CreateWorkflowStageDTO) {
    return db.workflowStage.create({
      data: {
        name: data.name,
        order: data.order ?? 0,
        franchiseId: data.franchiseId || null,
      },
    });
  }

  async update(id: string, data: UpdateWorkflowStageDTO) {
    return db.workflowStage.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    return db.workflowStage.update({
      where: { id },
      data: { isDeleted: true },
    });
  }
}
