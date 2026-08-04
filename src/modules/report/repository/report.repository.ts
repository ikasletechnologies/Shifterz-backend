import { db } from '../../../lib/db.js';

export class ReportRepository {
  // ─── Existing ERP Reports ────────────────────────────────────────────────

  async getInvoices(franchiseId?: string) {
    return db.invoice.findMany({ where: franchiseId ? { franchiseId, isDeleted: false } : { isDeleted: false } });
  }

  async getInvoicesInRange(franchiseId?: string, from?: Date, to?: Date) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }
    return db.invoice.findMany({ where, orderBy: { date: 'desc' } });
  }
  async getPayments(franchiseId?: string) {
    return db.payment.findMany({ where: franchiseId ? { franchiseId, isDeleted: false } : { isDeleted: false } });
  }
  async getLeads(franchiseId?: string) {
    return db.lead.findMany({ where: franchiseId ? { franchiseId, isDeleted: false } : { isDeleted: false } });
  }
  async getJobs(franchiseId?: string) {
    return db.job.findMany({ where: franchiseId ? { franchiseId, isDeleted: false } : { isDeleted: false } });
  }
  async getInventory(franchiseId?: string) {
    return db.inventory.findMany({ where: franchiseId ? { franchiseId, isDeleted: false } : { isDeleted: false } });
  }
  async getFranchises(franchiseId?: string) {
    return db.franchise.findMany({ where: franchiseId ? { id: franchiseId, isDeleted: false } : { isDeleted: false } });
  }

  // ─── Reception Reports ────────────────────────────────────────────────────

  async getAppointments(franchiseId?: string, from?: Date, to?: Date) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.scheduledDate = {};
      if (from) where.scheduledDate.gte = from;
      if (to) where.scheduledDate.lte = to;
    }
    return db.appointment.findMany({ where, orderBy: { scheduledDate: 'asc' } });
  }

  async getWalkIns(franchiseId?: string, from?: Date, to?: Date) {
    // Walk-ins are check-ins without a prior appointment (appointmentId is null on CarIn)
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.inTime = {};
      if (from) where.inTime.gte = from;
      if (to) where.inTime.lte = to;
    }
    return db.carIn.findMany({ where, orderBy: { inTime: 'desc' } });
  }

  async getCheckins(franchiseId?: string, from?: Date, to?: Date) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.inTime = {};
      if (from) where.inTime.gte = from;
      if (to) where.inTime.lte = to;
    }
    return db.carIn.findMany({ where, orderBy: { inTime: 'desc' } });
  }

  async getDeliveries(franchiseId?: string, from?: Date, to?: Date) {
    const where: any = { isDeleted: false, status: 'Delivered', checkOutAt: { not: null } };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.checkOutAt = {};
      if (from) where.checkOutAt.gte = from;
      if (to) where.checkOutAt.lte = to;
    }
    return db.carIn.findMany({ where, orderBy: { checkOutAt: 'desc' } });
  }

  async getReceptionRegister(franchiseId?: string, from?: Date, to?: Date) {
    // All check-ins with their current status (full reception log)
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.inTime = {};
      if (from) where.inTime.gte = from;
      if (to) where.inTime.lte = to;
    }
    return db.carIn.findMany({ where, orderBy: { inTime: 'desc' } });
  }

  async getPendingVehicles(franchiseId?: string) {
    // Vehicles currently in workshop (not yet delivered)
    const where: any = { isDeleted: false, status: { not: 'Delivered' } };
    if (franchiseId) where.franchiseId = franchiseId;
    return db.carIn.findMany({ where, orderBy: { inTime: 'asc' } });
  }

  async getDailyMovement(franchiseId?: string, date?: Date) {
    const targetDate = date || new Date();
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const where: any = {
      isDeleted: false,
      OR: [
        { inTime: { gte: start, lte: end } },
        { checkOutAt: { gte: start, lte: end } }
      ]
    };
    if (franchiseId) where.franchiseId = franchiseId;
    return db.carIn.findMany({ where, orderBy: { inTime: 'asc' } });
  }

  // ─── Workshop Reports (PRD §10.12) ─────────────────────────────────────────

  async getWorkshopJobs(franchiseId?: string, from?: Date, to?: Date) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.startDate = {};
      if (from) where.startDate.gte = from;
      if (to) where.startDate.lte = to;
    }
    return db.job.findMany({ where, orderBy: { startDate: 'desc' } });
  }

  async getTechnicians(franchiseId?: string) {
    const where: any = { isDeleted: false, role: 'TECHNICIAN' };
    if (franchiseId) where.franchiseId = franchiseId;
    return db.employee.findMany({ where });
  }

  async getMaterialConsumptions(franchiseId?: string, from?: Date, to?: Date) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }
    return db.materialConsumption.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  // ─── QC Reports (PRD §12.9) ─────────────────────────────────────────────────

  async getQcInspections(franchiseId?: string, from?: Date, to?: Date) {
    const where: any = {};
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = to;
    }
    return db.qCInspection.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  async getQualityInspectors(franchiseId?: string) {
    const where: any = { isDeleted: false, role: { in: ['QUALITY_INSPECTOR'] } };
    if (franchiseId) where.franchiseId = franchiseId;
    return db.employee.findMany({ where });
  }

  // ─── Financial, CRM, Customer, Employee Reports Helpers ─────────────────────

  async getPaymentsInRange(franchiseId?: string, from?: Date, to?: Date) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }
    return db.payment.findMany({ where, orderBy: { date: 'desc' } });
  }

  async getLeadsInRange(franchiseId?: string, from?: Date, to?: Date) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }
    return db.lead.findMany({ where, orderBy: { date: 'desc' } });
  }

  async getCustomers(franchiseId?: string) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    return db.customer.findMany({ where, orderBy: { lastVisit: 'desc' } });
  }

  async getEmployees(franchiseId?: string) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    return db.employee.findMany({ where });
  }

  async getInventoryMovements(franchiseId?: string) {
    // If franchiseId is specified, we filter movements. But since InventoryMovement
    // doesn't have a franchiseId column in the schema, we link through items.
    if (franchiseId) {
      return db.inventoryMovement.findMany({
        where: {
          itemId: {
            in: (await db.inventory.findMany({
              where: { franchiseId, isDeleted: false },
              select: { id: true }
            })).map(i => i.id)
          }
        },
        orderBy: { performedAt: 'desc' }
      });
    }
    return db.inventoryMovement.findMany({
      orderBy: { performedAt: 'desc' }
    });
  }

  async getLeadFollowUpsInRange(franchiseId?: string, from?: Date, to?: Date) {
    const where: any = {};
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.followUpDate = {};
      if (from) where.followUpDate.gte = from;
      if (to) where.followUpDate.lte = to;
    }
    return db.leadFollowUp.findMany({
      where,
      orderBy: { followUpDate: 'desc' }
    });
  }
}
