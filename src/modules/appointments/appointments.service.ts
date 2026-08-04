import { AppointmentsRepository } from './appointments.repository.js';
import type { CreateAppointmentDTO, UpdateAppointmentDTO } from './appointments.validation.js';
import { generateUid } from '../../shared/utils/idGenerator.js';
import { db } from '../../lib/db.js';
import {
  notifyAppointmentConfirmation,
  notifyAppointmentStatusChange,
} from '../../shared/services/notification.service.js';

export class AppointmentsService {
  constructor(private readonly repository: AppointmentsRepository = new AppointmentsRepository()) {}

  async getAppointments(tenantFilter: any) {
    return this.repository.findAll(tenantFilter);
  }

  async getAppointmentById(id: string) {
    const appointment = await this.repository.findById(id);
    if (!appointment) {
      throw new Error(`Appointment ${id} not found`);
    }
    return appointment;
  }

  async createAppointment(data: CreateAppointmentDTO, franchiseId: string | null) {
    const id = generateUid('APT');

    // Verify customer exists if customerId provided
    let customer: { name: string; phone: string | null; email: string | null } | null = null;
    if (data.customerId) {
      customer = await db.customer.findUnique({
        where: { id: data.customerId, isDeleted: false },
        select: { name: true, phone: true, email: true },
      });
      if (!customer) {
        throw new Error(`Customer ${data.customerId} not found`);
      }
    }

    // Verify staff exists if assignedStaffId is provided
    if (data.assignedStaffId) {
      const staff = await db.employee.findFirst({
        where: { id: data.assignedStaffId, isDeleted: false },
      });
      if (!staff) {
        throw new Error(`Assigned staff member not found`);
      }
    }

    const appointment = await this.repository.create(id, data, franchiseId);

    // ── Notification: Appointment Confirmation ────────────────────────────────
    notifyAppointmentConfirmation({
      franchiseId,
      customerName: data.customerName || customer?.name || 'Customer',
      customerPhone: customer?.phone,
      customerEmail: customer?.email,
      vehicle: data.vehicle,
      service: data.service || '',
      scheduledDate: data.scheduledDate,
      assignedStaffId: data.assignedStaffId,
      assignedStaff: data.assignedStaff,
    }).catch(console.error);

    return appointment;
  }

  async updateAppointment(id: string, data: UpdateAppointmentDTO) {
    const appointment = await this.getAppointmentById(id);

    let customer: { name: string; phone: string | null; email: string | null } | null = null;
    const customerId = data.customerId || appointment.customerId;
    if (customerId) {
      customer = await db.customer.findUnique({
        where: { id: customerId, isDeleted: false },
        select: { name: true, phone: true, email: true },
      });
      if (data.customerId && !customer) {
        throw new Error(`Customer ${data.customerId} not found`);
      }
    }

    if (data.assignedStaffId) {
      const staff = await db.employee.findFirst({
        where: { id: data.assignedStaffId, isDeleted: false },
      });
      if (!staff) {
        throw new Error(`Assigned staff member not found`);
      }
    }

    const updated = await this.repository.update(id, data);

    // ── Notification: Status Change or Rescheduled ────────────────────────────
    const notifiableStatuses = ['Confirmed', 'Rescheduled', 'Cancelled', 'No Show'];
    const newStatus = data.status || '';
    if (notifiableStatuses.includes(newStatus)) {
      notifyAppointmentStatusChange({
        franchiseId: appointment.franchiseId,
        customerName: customer?.name || appointment.customerName,
        customerPhone: customer?.phone,
        customerEmail: customer?.email,
        vehicle: data.vehicle || appointment.vehicle,
        service: data.service || appointment.service || '',
        newStatus,
        scheduledDate: data.scheduledDate || appointment.scheduledDate,
        assignedStaffId: data.assignedStaffId || appointment.assignedStaffId,
      }).catch(console.error);
    }

    return updated;
  }

  async deleteAppointment(id: string) {
    await this.getAppointmentById(id);
    return this.repository.softDelete(id);
  }
}
