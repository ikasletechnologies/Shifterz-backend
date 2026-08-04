import { db } from '../../../lib/db.js';

export type CalendarViewType = 'day' | 'week' | 'month';

export interface CalendarEventDTO {
  id: string;
  title: string;
  description?: string | null;
  start: Date;
  end?: Date | null;
  type: 'CALLBACK' | 'FOLLOWUP' | 'APPOINTMENT' | 'EVENT' | 'OVERDUE_CALLBACK';
  status?: string | null;
  leadId?: string | null;
  customerId?: string | null;
  assignedTo?: string | null;
}

export class CalendarService {
  /**
   * Build the date range for the requested view, based on a reference date.
   */
  private getRange(view: CalendarViewType, refDate: Date): { from: Date; to: Date } {
    const from = new Date(refDate);
    const to = new Date(refDate);

    if (view === 'day') {
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
    } else if (view === 'week') {
      const dow = from.getDay(); // 0 = Sunday
      from.setDate(from.getDate() - dow);
      from.setHours(0, 0, 0, 0);
      to.setDate(from.getDate() + 6);
      to.setHours(23, 59, 59, 999);
    } else {
      // month
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      to.setMonth(to.getMonth() + 1, 0); // last day of month
      to.setHours(23, 59, 59, 999);
    }

    return { from, to };
  }

  /**
   * Return all calendar events for a user+franchise within the requested view.
   * Aggregates:
   *  - Callbacks (Pending / Rescheduled) → CALLBACK
   *  - Overdue Callbacks                 → OVERDUE_CALLBACK
   *  - LeadFollowUps (nextFollowUpDate)  → FOLLOWUP
   *  - Appointments                      → APPOINTMENT
   *  - CalendarEvents (custom)           → EVENT
   */
  async getEvents(
    view: CalendarViewType,
    refDate: Date,
    employeeId: string | null,
    franchiseId: string | null,
    isHQ: boolean,
  ): Promise<CalendarEventDTO[]> {
    const { from, to } = this.getRange(view, refDate);

    const events: CalendarEventDTO[] = [];

    // ── 1. Callbacks in range ────────────────────────────────────────────────
    const callbacks = await db.callback.findMany({
      where: {
        isDeleted: false,
        scheduledAt: { gte: from, lte: to },
        ...(employeeId && !isHQ ? { assignedToId: employeeId } : {}),
        ...(!isHQ && franchiseId ? { franchiseId } : {}),
      },
      orderBy: { scheduledAt: 'asc' },
    });
    for (const cb of callbacks) {
      events.push({
        id: cb.id,
        title: `📞 Callback: ${cb.leadName || cb.customerName || 'Customer'}`,
        description: cb.reminderNotes,
        start: cb.scheduledAt,
        end: null,
        type: cb.status === 'Overdue' ? 'OVERDUE_CALLBACK' : 'CALLBACK',
        status: cb.status,
        leadId: cb.leadId,
        customerId: cb.customerId,
        assignedTo: cb.assignedTo,
      });
    }

    // ── 2. Overdue callbacks (past their scheduledAt, still pending) ─────────
    const overdueCallbacks = await db.callback.findMany({
      where: {
        isDeleted: false,
        status: { in: ['Pending', 'Overdue'] },
        scheduledAt: { lt: from }, // before range start but not yet done
        ...(employeeId && !isHQ ? { assignedToId: employeeId } : {}),
        ...(!isHQ && franchiseId ? { franchiseId } : {}),
      },
      orderBy: { scheduledAt: 'asc' },
    });
    for (const cb of overdueCallbacks) {
      events.push({
        id: `overdue-${cb.id}`,
        title: `⚠️ OVERDUE: ${cb.leadName || cb.customerName || 'Customer'}`,
        description: cb.reminderNotes,
        start: cb.scheduledAt,
        end: null,
        type: 'OVERDUE_CALLBACK',
        status: 'Overdue',
        leadId: cb.leadId,
        customerId: cb.customerId,
        assignedTo: cb.assignedTo,
      });
    }

    // ── 3. Lead follow-ups with nextFollowUpDate in range ────────────────────
    const followUps = await db.leadFollowUp.findMany({
      where: {
        nextFollowUpDate: { gte: from, lte: to },
        ...(!isHQ && franchiseId ? { franchiseId } : {}),
        ...(employeeId && !isHQ ? { performedById: employeeId } : {}),
      },
      orderBy: { nextFollowUpDate: 'asc' },
    });
    for (const fu of followUps) {
      events.push({
        id: `followup-${fu.id}`,
        title: `🔁 Follow-up`,
        description: fu.nextAction || fu.notes,
        start: fu.nextFollowUpDate!,
        end: null,
        type: 'FOLLOWUP',
        status: null,
        leadId: fu.leadId,
        assignedTo: fu.performedBy,
      });
    }

    // ── 4. Appointments in range ─────────────────────────────────────────────
    const appointments = await db.appointment.findMany({
      where: {
        isDeleted: false,
        scheduledDate: { gte: from, lte: to },
        ...(!isHQ && franchiseId ? { franchiseId } : {}),
      },
      orderBy: { scheduledDate: 'asc' },
    });
    for (const apt of appointments) {
      events.push({
        id: `appt-${apt.id}`,
        title: `🚗 Appointment: ${apt.customerName}`,
        description: apt.service,
        start: apt.scheduledDate,
        end: null,
        type: 'APPOINTMENT',
        status: apt.status,
        customerId: apt.customerId,
      });
    }

    // ── 5. Custom calendar events ────────────────────────────────────────────
    const calEvents = await db.calendarEvent.findMany({
      where: {
        isDeleted: false,
        start: { gte: from },
        end: { lte: to },
        ...(!isHQ && franchiseId ? { franchiseId } : {}),
      },
      orderBy: { start: 'asc' },
    });
    for (const ev of calEvents) {
      events.push({
        id: `ev-${ev.id}`,
        title: ev.title,
        description: ev.description,
        start: ev.start,
        end: ev.end,
        type: 'EVENT',
      });
    }

    // Sort everything by start time
    events.sort((a, b) => a.start.getTime() - b.start.getTime());
    return events;
  }
}
