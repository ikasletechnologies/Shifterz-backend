import { db } from '../../lib/db.js';
import type { CreateAppointmentDTO, UpdateAppointmentDTO } from './appointments.validation.js';

export class AppointmentsRepository {
  async findAll(tenantFilter: any) {
    return db.appointment.findMany({
      where: {
        ...tenantFilter,
        isDeleted: false
      },
      orderBy: { scheduledDate: 'asc' }
    });
  }

  async findById(id: string) {
    return db.appointment.findFirst({
      where: {
        id,
        isDeleted: false
      }
    });
  }

  async create(id: string, data: CreateAppointmentDTO, franchiseId: string | null) {
    return db.appointment.create({
      data: {
        id,
        customerId: data.customerId || null,
        customerName: data.customerName,
        vehicle: data.vehicle,
        scheduledDate: data.scheduledDate,
        service: data.service,
        status: data.status || "Scheduled",
        assignedStaff: data.assignedStaff || null,
        assignedStaffId: data.assignedStaffId || null,
        franchiseId
      }
    });
  }

  async update(id: string, data: UpdateAppointmentDTO) {
    return db.appointment.update({
      where: { id },
      data: {
        customerId: data.customerId,
        customerName: data.customerName,
        vehicle: data.vehicle,
        scheduledDate: data.scheduledDate,
        service: data.service,
        status: data.status,
        assignedStaff: data.assignedStaff,
        assignedStaffId: data.assignedStaffId
      }
    });
  }

  async softDelete(id: string) {
    return db.appointment.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date()
      }
    });
  }
}
