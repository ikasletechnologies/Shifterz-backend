import { OutpassRepository } from '../repository/outpass.repository.js';
import type { CreateOutpassDTO, UpdateOutpassDTO } from '../validation/outpass.validation.js';
import { generateUid } from '../../../shared/utils/idGenerator.js';
import { db } from '../../../lib/db.js';

export class OutpassService {
  constructor(private readonly repository: OutpassRepository = new OutpassRepository()) {}

  async getAllOutpasses(userRole?: string, franchiseId?: string) {
    const conditions: any = { isDeleted: false };
    if (userRole && userRole !== "SUPER_ADMIN" && userRole !== "HQ_USER" && franchiseId) {
      conditions.franchiseId = franchiseId;
    }
    return db.outPass.findMany({
      where: conditions,
      orderBy: { outTime: "desc" }
    });
  }

  async createOutpass(data: CreateOutpassDTO, franchiseId: string | null = null) {
    const passId = generateUid("OP");
    return this.repository.create(passId, {
      ...data,
      status: "Pending",
      issued: false,
      franchiseId,
    });
  }

  async updateOutpass(id: string, data: UpdateOutpassDTO) {
    return this.repository.update(id, data);
  }

  async approveOutpass(id: string, userId: string, userName: string) {
    return db.outPass.update({
      where: { id },
      data: {
        status: "Approved",
        issued: true,
        approvedBy: userId,
        approvedAt: new Date(),
      }
    });
  }

  async rejectOutpass(id: string) {
    return db.outPass.update({
      where: { id },
      data: {
        status: "Rejected",
        issued: false,
      }
    });
  }
}
