import { db } from '../../../lib/db.js';
import { CallbackRepository } from '../repository/callback.repository.js';
import { sendNotification } from '../../../shared/services/notification.service.js';
import type {
  CreateCallbackDTO,
  CompleteCallbackDTO,
  RescheduleCallbackDTO,
} from '../validation/callback.validation.js';

export class CallbackService {
  private repo: CallbackRepository;

  constructor() {
    this.repo = new CallbackRepository();
  }

  /**
   * Schedule a new callback.
   * - Creates the Callback record
   * - Creates a task-style Notification for the assigned employee immediately
   * - Adds the callback to the employee's task list (via Notification)
   */
  async scheduleCallback(
    data: CreateCallbackDTO,
    franchiseId: string | null,
    createdBy: string,
  ) {
    const callback = await this.repo.create(data, franchiseId, createdBy);

    // Immediate task notification to the assigned employee
    await sendNotification(
      data.assignedToId,
      '📞 New Callback Scheduled',
      `Callback with ${data.leadName || data.customerName || 'customer'} is scheduled for ${new Date(data.scheduledAt).toLocaleString()}. Notes: ${data.reminderNotes}`,
    );

    return callback;
  }

  /** Retrieve all callbacks assigned to an employee (their task list) */
  async getMyCallbacks(assignedToId: string) {
    await this.repo.markOverdue(); // mark stale ones overdue on every read
    return this.repo.findByEmployee(assignedToId);
  }

  /** Retrieve all callbacks for a franchise (managers) */
  async getFranchiseCallbacks(franchiseId: string | null) {
    await this.repo.markOverdue();
    return this.repo.findByFranchise(franchiseId);
  }

  /** Mark a callback as Completed */
  async completeCallback(id: string, data: CompleteCallbackDTO, completedBy: string) {
    const cb = await this.repo.findById(id);
    if (!cb) throw new Error(`Callback ${id} not found`);
    if (cb.status === 'Completed') throw new Error('Callback is already completed');

    return this.repo.update(id, {
      status: 'Completed',
      completedAt: new Date(),
      completedBy: completedBy ?? undefined,
      completedNotes: data.completedNotes ?? undefined,
    });
  }

  /**
   * Reschedule an overdue / pending callback.
   * - Updates scheduledAt and status
   * - Sends a new reminder notification
   */
  async rescheduleCallback(id: string, data: RescheduleCallbackDTO, updatedBy: string) {
    const cb = await this.repo.findById(id);
    if (!cb) throw new Error(`Callback ${id} not found`);

    const updated = await this.repo.update(id, {
      scheduledAt: data.rescheduledTo,
      rescheduledTo: new Date(data.rescheduledTo),
      status: 'Rescheduled',
      reminderNotes: data.reminderNotes ?? cb.reminderNotes,
    });

    // Re-notify the assigned employee
    await sendNotification(
      cb.assignedToId,
      '📅 Callback Rescheduled',
      `Your callback with ${cb.leadName || cb.customerName || 'customer'} has been rescheduled to ${new Date(data.rescheduledTo).toLocaleString()} by ${updatedBy}.`,
    );

    return updated;
  }

  /** Delete (soft) a callback */
  async deleteCallback(id: string) {
    const cb = await this.repo.findById(id);
    if (!cb) throw new Error(`Callback ${id} not found`);
    return this.repo.softDelete(id);
  }

  /**
   * Dispatch reminder notifications for callbacks due in the next N minutes.
   * Called by the background scheduler.
   */
  async dispatchReminderNotifications(windowMinutes = 15) {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowMinutes * 60_000);

    const upcoming = await db.callback.findMany({
      where: {
        status: { in: ['Pending', 'Rescheduled'] },
        scheduledAt: { gte: now, lte: windowEnd },
        isDeleted: false,
      },
    });

    for (const cb of upcoming) {
      await sendNotification(
        cb.assignedToId,
        '⏰ Callback Reminder',
        `Reminder: Your callback with ${cb.leadName || cb.customerName || 'customer'} is due at ${new Date(cb.scheduledAt).toLocaleString()}. Notes: ${cb.reminderNotes}`,
      );
    }

    return { dispatched: upcoming.length };
  }
}
