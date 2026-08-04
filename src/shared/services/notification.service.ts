import { db } from '../../lib/db.js';

// ─── Core Primitives ──────────────────────────────────────────────────────────

export async function sendNotification(userId: string, title: string, message: string) {
  return db.notification.create({
    data: {
      userId,
      title,
      message,
      read: false,
    },
  });
}

export async function notifyManagers(franchiseId: string | null, title: string, message: string) {
  const managers = await db.employee.findMany({
    where: {
      isDeleted: false,
      status: 'Active',
      OR: [
        { role: { in: ['SUPER_ADMIN', 'HQ_USER'] } },
        {
          role: { in: ['FRANCHISE_ADMIN', 'BRANCH_MANAGER'] },
          franchiseId: franchiseId,
        },
      ],
    },
  });

  const promises = managers.map((m) =>
    sendNotification(m.id, title, message).catch((err) =>
      console.error(`Failed to send notification to user ${m.id}:`, err)
    )
  );

  await Promise.all(promises);
}

export async function sendEmail(to: string, subject: string, body: string) {
  console.log(`[Email dispatched to ${to}] Subject: ${subject} | Body: ${body}`);
  return { success: true, channel: 'Email', recipient: to };
}

export async function sendWhatsApp(to: string, message: string) {
  console.log(`[WhatsApp message dispatched to ${to}] Message: ${message}`);
  return { success: true, channel: 'WhatsApp', recipient: to };
}

// ─── Multi-Channel Customer Dispatch ─────────────────────────────────────────

export async function notifyCustomer(phone: string | null | undefined, email: string | null | undefined, subject: string, message: string) {
  const tasks: Promise<any>[] = [];
  if (phone) tasks.push(sendWhatsApp(phone, message).catch(console.error));
  if (email) tasks.push(sendEmail(email, subject, message).catch(console.error));
  await Promise.all(tasks);
}

async function notifyEmployee(employeeId: string | null | undefined, title: string, message: string) {
  if (!employeeId) return;
  await sendNotification(employeeId, title, message).catch(console.error);
}

// ─── Reception Notification Events ───────────────────────────────────────────

/**
 * EVENT 1: Appointment Confirmation
 * Fired when a new appointment is created.
 * Recipients: Customer (WhatsApp + Email), Assigned Employee (in-app), Branch Manager (in-app)
 */
export async function notifyAppointmentConfirmation(opts: {
  franchiseId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  vehicle: string;
  service: string;
  scheduledDate: Date | string;
  assignedStaffId?: string | null;
  assignedStaff?: string | null;
}) {
  const dateStr = new Date(opts.scheduledDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  // Customer notification
  const customerSubject = `Appointment Confirmed – ${opts.vehicle}`;
  const customerMsg =
    `Dear ${opts.customerName},\n` +
    `Your appointment has been confirmed.\n` +
    `Vehicle: ${opts.vehicle}\n` +
    `Service: ${opts.service}\n` +
    `Date & Time: ${dateStr}\n` +
    `Thank you for choosing us!`;

  await notifyCustomer(opts.customerPhone, opts.customerEmail, customerSubject, customerMsg);

  // Assigned employee notification (in-app)
  await notifyEmployee(
    opts.assignedStaffId,
    'New Appointment Assigned',
    `You have a new appointment for ${opts.vehicle} (${opts.customerName}) scheduled on ${dateStr}. Service: ${opts.service}.`
  );

  // Branch manager notification (in-app)
  await notifyManagers(
    opts.franchiseId || null,
    'Appointment Booked',
    `New appointment scheduled: ${opts.vehicle} (${opts.customerName}) on ${dateStr}. Assigned to: ${opts.assignedStaff || 'Unassigned'}.`
  ).catch(console.error);
}

/**
 * EVENT 2: Job Assigned to Employee
 * Fired when a technician / responsible employee is assigned to a job card.
 * Recipients: Assigned Employee (in-app + WhatsApp), Branch Manager (in-app)
 */
export async function notifyJobAssigned(opts: {
  franchiseId?: string | null;
  jobId: string;
  vehicle: string;
  customerName: string;
  technicianId?: string | null;
  technicianName?: string | null;
}) {
  // Look up technician's contact details
  let techPhone: string | null = null;
  if (opts.technicianId) {
    const emp = await db.employee.findFirst({
      where: { id: opts.technicianId, isDeleted: false },
      select: { phone: true },
    }).catch(() => null);
    techPhone = emp?.phone || null;
  }

  const title = 'Job Assigned to You';
  const msg = `You have been assigned to Job Card ${opts.jobId} for vehicle ${opts.vehicle} (${opts.customerName}). Please proceed with the service.`;

  await notifyEmployee(opts.technicianId, title, msg);
  if (techPhone) await sendWhatsApp(techPhone, msg).catch(console.error);

  // Branch manager
  await notifyManagers(
    opts.franchiseId || null,
    'Job Assignment',
    `Job ${opts.jobId} (${opts.vehicle} – ${opts.customerName}) assigned to ${opts.technicianName || 'a technician'}.`
  ).catch(console.error);
}

/**
 * EVENT 3: Vehicle Ready for Delivery
 * Fired when vehicle checkout is completed.
 * Recipients: Customer (WhatsApp + Email), Branch Manager (in-app)
 */
export async function notifyVehicleReady(opts: {
  franchiseId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  vehicle: string;
  jobCardId: string;
}) {
  const subject = `Your Vehicle is Ready – ${opts.vehicle}`;
  const msg =
    `Dear ${opts.customerName},\n` +
    `Great news! Your vehicle ${opts.vehicle} is ready for collection.\n` +
    `Job Card: ${opts.jobCardId}\n` +
    `Please visit us at your earliest convenience.\n` +
    `Thank you for choosing us!`;

  await notifyCustomer(opts.customerPhone, opts.customerEmail, subject, msg);

  await notifyManagers(
    opts.franchiseId || null,
    'Vehicle Delivered',
    `Vehicle ${opts.vehicle} (${opts.customerName}) has been delivered. Job Card: ${opts.jobCardId}.`
  ).catch(console.error);
}

/**
 * EVENT 4: Estimated Delivery Update
 * Fired when the appointment is rescheduled or the expected delivery date changes.
 * Recipients: Customer (WhatsApp + Email), Assigned Employee (in-app), Branch Manager (in-app)
 */
export async function notifyEstimatedDeliveryUpdate(opts: {
  franchiseId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  vehicle: string;
  newDeliveryDate: Date | string;
  reason?: string | null;
  assignedStaffId?: string | null;
}) {
  const dateStr = new Date(opts.newDeliveryDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const subject = `Delivery Update – ${opts.vehicle}`;
  const msg =
    `Dear ${opts.customerName},\n` +
    `Your vehicle ${opts.vehicle} has an updated estimated delivery:\n` +
    `New Delivery: ${dateStr}\n` +
    (opts.reason ? `Reason: ${opts.reason}\n` : '') +
    `We apologise for any inconvenience and appreciate your patience.`;

  await notifyCustomer(opts.customerPhone, opts.customerEmail, subject, msg);

  await notifyEmployee(
    opts.assignedStaffId,
    'Delivery Date Updated',
    `Delivery date for vehicle ${opts.vehicle} (${opts.customerName}) updated to ${dateStr}.`
  );

  await notifyManagers(
    opts.franchiseId || null,
    'Delivery Date Updated',
    `Estimated delivery for ${opts.vehicle} (${opts.customerName}) updated to ${dateStr}.`
  ).catch(console.error);
}

/**
 * EVENT 5: Appointment Status Change (Rescheduled / Cancelled / Confirmed)
 * Fired on any appointment status update other than initial booking.
 * Recipients: Customer (WhatsApp + Email), Assigned Employee (in-app), Branch Manager (in-app)
 */
export async function notifyAppointmentStatusChange(opts: {
  franchiseId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  vehicle: string;
  service: string;
  newStatus: string;
  scheduledDate?: Date | string | null;
  assignedStaffId?: string | null;
}) {
  const dateStr = opts.scheduledDate
    ? new Date(opts.scheduledDate).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  const subject = `Appointment ${opts.newStatus} – ${opts.vehicle}`;
  const msg =
    `Dear ${opts.customerName},\n` +
    `Your appointment for ${opts.vehicle} has been ${opts.newStatus.toLowerCase()}.\n` +
    `Service: ${opts.service}\n` +
    (dateStr ? `Scheduled: ${dateStr}\n` : '') +
    `If you have any questions, please contact us.`;

  await notifyCustomer(opts.customerPhone, opts.customerEmail, subject, msg);

  await notifyEmployee(
    opts.assignedStaffId,
    `Appointment ${opts.newStatus}`,
    `Appointment for ${opts.vehicle} (${opts.customerName}) has been ${opts.newStatus.toLowerCase()}.${dateStr ? ` Date: ${dateStr}` : ''}`
  );

  await notifyManagers(
    opts.franchiseId || null,
    `Appointment ${opts.newStatus}`,
    `Appointment for ${opts.vehicle} (${opts.customerName}) updated to '${opts.newStatus}'.${dateStr ? ` Scheduled: ${dateStr}.` : ''}`
  ).catch(console.error);
}

// ─── Workshop Operations Notification Events (PRD §10.13) ────────────────────

/**
 * EVENT 6: Priority Changed
 * Fired when a job card's priority is updated.
 * Recipients: Assigned Employee (in-app)
 */
export async function notifyPriorityChanged(opts: {
  jobId: string;
  vehicle: string;
  technicianId?: string | null;
  newPriority: string;
}) {
  await notifyEmployee(
    opts.technicianId,
    'Priority Changed',
    `Priority for Job ${opts.jobId} (${opts.vehicle}) has been changed to ${opts.newPriority}.`
  );
}

/**
 * EVENT 7: Additional Work Requested
 * Fired when an employee submits an additional work request.
 * Recipients: Managers (in-app)
 */
export async function notifyAdditionalWorkRequested(opts: {
  franchiseId?: string | null;
  jobId: string;
  vehicle: string;
  description: string;
  requestedBy?: string | null;
}) {
  await notifyManagers(
    opts.franchiseId || null,
    'Additional Work Requested',
    `${opts.requestedBy || 'A technician'} requested additional work on Job ${opts.jobId} (${opts.vehicle}): ${opts.description}.`
  ).catch(console.error);
}

/**
 * EVENT 8: Additional Work Approval / Rejection
 * Fired when management resolves an additional work request.
 * Recipients: Requesting Employee (in-app)
 */
export async function notifyAdditionalWorkApproval(opts: {
  jobId: string;
  vehicle: string;
  requestedById?: string | null;
  status: 'Approved' | 'Rejected';
}) {
  await notifyEmployee(
    opts.requestedById,
    `Additional Work ${opts.status}`,
    `Your additional work request for Job ${opts.jobId} (${opts.vehicle}) was ${opts.status.toLowerCase()}.`
  );
}

/**
 * EVENT 9: Material Request Pending
 * Fired when an employee records material consumption awaiting approval.
 * Recipients: Managers (in-app)
 */
export async function notifyMaterialRequestPending(opts: {
  franchiseId?: string | null;
  jobId: string;
  vehicle: string;
  itemName: string;
  quantity: number;
}) {
  await notifyManagers(
    opts.franchiseId || null,
    'Pending Material Request',
    `Material consumption pending approval for Job ${opts.jobId} (${opts.vehicle}): ${opts.quantity} x ${opts.itemName}.`
  ).catch(console.error);
}

/**
 * EVENT 10: Work Completion
 * Fired when the Primary Responsible Employee submits a job for QC.
 * Recipients: Managers (in-app)
 */
export async function notifyWorkCompletion(opts: {
  franchiseId?: string | null;
  jobId: string;
  vehicle: string;
  customerName: string;
}) {
  await notifyManagers(
    opts.franchiseId || null,
    'Work Completion — Ready for QC',
    `Job ${opts.jobId} (${opts.vehicle} – ${opts.customerName}) has been submitted for Quality Control.`
  ).catch(console.error);
}

/**
 * Sweep: Upcoming Delivery / Delayed Jobs
 * Not event-triggered — meant to be invoked periodically (e.g. by an external
 * scheduler hitting a controller endpoint), same convention as
 * dispatchCustomerReminders below.
 * - Jobs due within the next 2 hours (not yet completed) → notify assigned employee.
 * - Jobs already past their estimated completion (not yet completed) → notify managers.
 */
export async function dispatchWorkshopReminders() {
  const now = new Date();
  const soon = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  const openJobs = await db.job.findMany({
    where: { isDeleted: false, actualCompletion: null },
    select: { id: true, vehicle: true, customer: true, technicianId: true, franchiseId: true, estCompletion: true },
  });

  let upcomingCount = 0;
  let delayedCount = 0;

  for (const job of openJobs) {
    if (!job.estCompletion) continue;
    const est = new Date(job.estCompletion);

    if (est < now) {
      delayedCount++;
      await notifyManagers(
        job.franchiseId,
        'Delayed Job',
        `Job ${job.id} (${job.vehicle} – ${job.customer}) is past its estimated completion time.`
      ).catch(console.error);
    } else if (est <= soon) {
      upcomingCount++;
      await notifyEmployee(
        job.technicianId,
        'Upcoming Delivery Time',
        `Job ${job.id} (${job.vehicle} – ${job.customer}) is due for delivery soon.`
      );
    }
  }

  return { upcomingCount, delayedCount };
}

// ─── Quality Control Notification Events (PRD §12.10) ────────────────────────

/**
 * EVENT 11: QC Assigned
 * Fired when management assigns a Quality Inspector to a job.
 * Recipients: Assigned Inspector (in-app)
 */
export async function notifyQcAssigned(opts: {
  jobId: string;
  vehicle: string;
  inspectorId?: string | null;
}) {
  await notifyEmployee(
    opts.inspectorId,
    'QC Assignment',
    `You have been assigned to inspect Job ${opts.jobId} (${opts.vehicle}).`
  );
}

/**
 * EVENT 12: QC Failed / Rework Required
 * Fired when a Quality Inspector fails an inspection.
 * Recipients: Assigned Employee (in-app)
 */
export async function notifyQcFailed(opts: {
  jobId: string;
  vehicle: string;
  technicianId?: string | null;
  reason?: string | null;
}) {
  await notifyEmployee(
    opts.technicianId,
    'QC Failed — Rework Required',
    `Job ${opts.jobId} (${opts.vehicle}) failed Quality Control${opts.reason ? `: ${opts.reason}` : '.'} Please complete the required rework.`
  );
}

/**
 * Billing Team dispatch — parallel to notifyManagers, but targets the
 * billing-facing roles instead of franchise/HQ management.
 */
export async function notifyBillingTeam(franchiseId: string | null, title: string, message: string) {
  const billingStaff = await db.employee.findMany({
    where: {
      isDeleted: false,
      status: 'Active',
      OR: [
        { role: { in: ['SUPER_ADMIN', 'HQ_USER', 'HQ_ACCOUNTS'] } },
        { role: 'BILLING_EXECUTIVE', franchiseId },
      ],
    },
  });

  const promises = billingStaff.map((m) =>
    sendNotification(m.id, title, message).catch((err) =>
      console.error(`Failed to send notification to user ${m.id}:`, err)
    )
  );

  await Promise.all(promises);
}

/**
 * EVENT 13: QC Passed — Ready for Billing
 * Fired when a Quality Inspector passes an inspection.
 * Recipients: Billing Team (in-app)
 */
export async function notifyQcPassed(opts: {
  franchiseId?: string | null;
  jobId: string;
  vehicle: string;
  customerName: string;
}) {
  await notifyBillingTeam(
    opts.franchiseId || null,
    'QC Passed — Ready for Billing',
    `Job ${opts.jobId} (${opts.vehicle} – ${opts.customerName}) passed Quality Control and is ready for billing.`
  ).catch(console.error);
}

/**
 * Sweep: QC Alerts for HQ (12.10)
 * Not event-triggered — meant to be invoked periodically (e.g. by an external
 * scheduler hitting a controller endpoint), same convention as
 * dispatchWorkshopReminders.
 * - High QC Failure Rate: per franchise, Failed / (Passed+Failed) over recent
 *   QCInspections exceeds a threshold.
 * - Delayed QC: jobs waiting on QC longer than a threshold.
 * - Multiple Rework Cases: jobs with reworkCount >= 2.
 */
export async function dispatchQcAlerts() {
  const FAILURE_RATE_THRESHOLD = 0.3;
  const DELAYED_QC_HOURS = 4;
  const REWORK_THRESHOLD = 2;

  const now = new Date();
  const delayedCutoff = new Date(now.getTime() - DELAYED_QC_HOURS * 60 * 60 * 1000);

  let highFailureFranchises = 0;
  let delayedCount = 0;
  let multiReworkCount = 0;

  // High QC Failure Rate — grouped by franchise
  const decidedInspections = await db.qCInspection.findMany({
    where: { result: { in: ['Passed', 'Failed'] } },
    select: { result: true, franchiseId: true },
  });
  const byFranchise = new Map<string, { passed: number; failed: number }>();
  for (const insp of decidedInspections) {
    const key = insp.franchiseId || 'HQ';
    const entry = byFranchise.get(key) || { passed: 0, failed: 0 };
    if (insp.result === 'Passed') entry.passed++; else entry.failed++;
    byFranchise.set(key, entry);
  }
  for (const [franchiseId, { passed, failed }] of byFranchise) {
    const total = passed + failed;
    if (total > 0 && failed / total > FAILURE_RATE_THRESHOLD) {
      highFailureFranchises++;
      await notifyManagers(
        franchiseId === 'HQ' ? null : franchiseId,
        'High QC Failure Rate',
        `QC failure rate is ${Math.round((failed / total) * 100)}% (${failed}/${total}) for this branch.`
      ).catch(console.error);
    }
  }

  // Delayed QC — jobs waiting too long
  const delayedJobs = await db.job.findMany({
    where: {
      isDeleted: false,
      status: { in: ['Waiting for Quality Check', 'Inspecting'] },
      updatedAt: { lte: delayedCutoff },
    },
    select: { id: true, vehicle: true, customer: true, franchiseId: true },
  });
  for (const job of delayedJobs) {
    delayedCount++;
    await notifyManagers(
      null,
      'Delayed QC',
      `Job ${job.id} (${job.vehicle} – ${job.customer}) has been waiting for QC for over ${DELAYED_QC_HOURS} hours.`
    ).catch(console.error);
  }

  // Multiple Rework Cases
  const reworkJobs = await db.job.findMany({
    where: { isDeleted: false, reworkCount: { gte: REWORK_THRESHOLD } },
    select: { id: true, vehicle: true, customer: true, reworkCount: true },
  });
  for (const job of reworkJobs) {
    multiReworkCount++;
    await notifyManagers(
      null,
      'Multiple Rework Cases',
      `Job ${job.id} (${job.vehicle} – ${job.customer}) has been reworked ${job.reworkCount} times.`
    ).catch(console.error);
  }

  return { highFailureFranchises, delayedCount, multiReworkCount };
}

// ─── Customer Lifecycle Reminders (existing - preserved) ─────────────────────

export async function dispatchCustomerReminders() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Service Due
  const dueReminders = await db.serviceReminder.findMany({
    where: { scheduledDate: { lte: now }, status: 'Pending', isDeleted: false },
    include: { customer: true },
  });
  for (const r of dueReminders) {
    const c = r.customer;
    const msg = `Dear ${c.name}, your vehicle ${r.vehicleNo} is due for ${r.reminderType}. Please book your appointment.`;
    if (c.phone) await sendWhatsApp(c.phone, msg).catch(console.error);
    if (c.email) await sendEmail(c.email, `Service Due – ${r.vehicleNo}`, msg).catch(console.error);
    await db.serviceReminder.update({ where: { id: r.id }, data: { status: 'Sent' } }).catch(console.error);
  }

  // Warranty Expiry (7 days ahead)
  const warnDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const expiringWarranties = await db.warranty.findMany({
    where: { expiryDate: { gte: now, lte: warnDate }, status: 'Active', isDeleted: false },
    include: { customer: true },
  });
  for (const w of expiringWarranties) {
    const c = w.customer;
    const expStr = w.expiryDate.toLocaleDateString('en-IN');
    const msg = `Dear ${c.name}, your warranty for ${w.itemName} (Vehicle: ${w.vehicleNo}) expires on ${expStr}. Please contact us.`;
    if (c.phone) await sendWhatsApp(c.phone, msg).catch(console.error);
    if (c.email) await sendEmail(c.email, `Warranty Expiring Soon – ${w.vehicleNo}`, msg).catch(console.error);
  }

  // Birthdays
  const [mm, dd] = [now.getMonth() + 1, now.getDate()];
  const allCustomers = await db.customer.findMany({
    where: { isDeleted: false, dob: { not: null } },
    select: { name: true, phone: true, email: true, dob: true },
  });
  for (const c of allCustomers) {
    if (!c.dob) continue;
    const d = new Date(c.dob);
    if (d.getMonth() + 1 === mm && d.getDate() === dd) {
      const msg = `Happy Birthday ${c.name}! 🎂 Wishing you a wonderful day. Thank you for being a valued customer.`;
      if (c.phone) await sendWhatsApp(c.phone, msg).catch(console.error);
      if (c.email) await sendEmail(c.email, 'Happy Birthday!', msg).catch(console.error);
    }
  }

  return { dispatched: dueReminders.length + expiringWarranties.length };
}
