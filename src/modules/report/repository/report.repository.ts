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
  // GST-06/GST-07 — the normalized ledger, not the Invoice table, is the
  // primary source for GST reporting from here on. documentTypes defaults to
  // ['INVOICE'] for GST-06's summary; GST-07 also queries
  // ['CREDIT_NOTE','DEBIT_NOTE'] for GSTR-1's CN/DN section — that query
  // already works today, it will simply return nothing until CN/DN issuance
  // (deliberately deferred) starts writing those rows.
  async getGstLedgerTransactionsInRange(franchiseId?: string, from?: Date, to?: Date, documentTypes: string[] = ['INVOICE']) {
    const where: any = { documentType: { in: documentTypes } };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.documentDate = {};
      if (from) where.documentDate.gte = from;
      if (to) where.documentDate.lte = to;
    }
    return db.gstTransaction.findMany({ where, orderBy: { documentDate: 'desc' } });
  }

  // Compatibility only: invoices that predate GST-05 (no ledger row exists
  // for them at all). Excludes anything the ledger already covers by id, so
  // nothing is ever double-counted between the two sources.
  async getInvoicesWithoutLedgerEntryInRange(ledgerDocumentIds: string[], franchiseId?: string, from?: Date, to?: Date) {
    const where: any = { isDeleted: false, type: 'Invoice', status: { not: 'Cancelled' }, id: { notIn: ledgerDocumentIds } };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }
    return db.invoice.findMany({ where, orderBy: { date: 'desc' } });
  }

  // Compatibility only, for excluding ledger rows whose underlying invoice
  // was cancelled AFTER the ledger row was written — the ledger has no
  // cancellation-sync mechanism yet (tracked as a follow-up alongside
  // GST-05A), so this is a lightweight status check, not a recomputation of
  // any GST figure.
  async getCancelledInvoiceIds(documentIds: string[]): Promise<Set<string>> {
    if (documentIds.length === 0) return new Set();
    const cancelled = await db.invoice.findMany({
      where: { id: { in: documentIds }, status: 'Cancelled' },
      select: { id: true },
    });
    return new Set(cancelled.map((c) => c.id));
  }

  // GSTR-1 CN/DN integration — same "lightweight status check, not a ledger
  // resync" pattern as getCancelledInvoiceIds above, plus originalInvoiceId,
  // which the ledger row itself doesn't carry (deliberately not duplicated
  // onto GstTransaction — CreditNote/DebitNote already own that FK).
  async getCreditNoteMetadata(ids: string[]): Promise<Map<string, { status: string; originalInvoiceId: string }>> {
    if (ids.length === 0) return new Map();
    const notes = await db.creditNote.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, originalInvoiceId: true },
    });
    return new Map(notes.map((n) => [n.id, { status: n.status, originalInvoiceId: n.originalInvoiceId }]));
  }

  async getDebitNoteMetadata(ids: string[]): Promise<Map<string, { status: string; originalInvoiceId: string }>> {
    if (ids.length === 0) return new Map();
    const notes = await db.debitNote.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true, originalInvoiceId: true },
    });
    return new Map(notes.map((n) => [n.id, { status: n.status, originalInvoiceId: n.originalInvoiceId }]));
  }

  // GSTR-2B — same bulk-lookup, no-N+1 pattern as getCreditNoteMetadata
  // above. vendorName is PurchaseOrder's own denormalized field, set once at
  // PO creation and never touched again by any write path in this codebase
  // — it functions as a stable historical snapshot for report display, the
  // same way the GST-critical vendorGstin/vendorState snapshot fields do.
  // isDeleted is PurchaseOrder's only cancellation concept (confirmed during
  // the GSTR-2B investigation — no separate "Cancelled" stage exists).
  async getPurchaseOrderMetadata(ids: string[]): Promise<Map<string, { vendorName: string; stage: string; isDeleted: boolean }>> {
    if (ids.length === 0) return new Map();
    const orders = await db.purchaseOrder.findMany({
      where: { id: { in: ids } },
      select: { id: true, vendorName: true, stage: true, isDeleted: true },
    });
    return new Map(orders.map((o) => [o.id, { vendorName: o.vendorName, stage: o.stage, isDeleted: o.isDeleted }]));
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
  // INV-05 — used to compute getHQSummary's pendingStockRequests/
  // pendingDispatches, which were hardcoded to 0 regardless of actual data.
  async getInventoryRequestsList(franchiseId?: string) {
    return db.inventoryRequest.findMany({ where: franchiseId ? { franchiseId, isDeleted: false } : { isDeleted: false } });
  }
  // INV-06B — date-ranged variant for the Stock Request Report, mirroring
  // the getInvoices/getInvoicesInRange split already used elsewhere in this
  // file rather than overloading the summary-only method above.
  async getInventoryRequestsInRange(franchiseId?: string, from?: Date, to?: Date) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }
    return db.inventoryRequest.findMany({ where, orderBy: { date: 'desc' } });
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

  // REP-01C (D-REP6) — a separate method, not a parameter on the shared
  // getWorkshopJobs() above, so the includeDeleted opt-in can never
  // accidentally leak into any of getWorkshopJobs()'s other ~8 existing
  // callers (getWorkProgressReport, getDelayAnalysisReport, etc.), all of
  // which must keep excluding deleted rows unconditionally. Used only by
  // getJobCardRegisterReport.
  async getWorkshopJobsForRegister(franchiseId?: string, from?: Date, to?: Date, includeDeleted = false) {
    const where: any = includeDeleted ? {} : { isDeleted: false };
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

  // REP-01C (D-REP6) — separate method, same reasoning as
  // getWorkshopJobsForRegister above: keeps the includeDeleted opt-in from
  // ever reaching getLeadsInRange()'s other ~7 existing callers. Used only
  // by getLeadRegisterReport.
  async getLeadsInRangeForRegister(franchiseId?: string, from?: Date, to?: Date, includeDeleted = false) {
    const where: any = includeDeleted ? {} : { isDeleted: false };
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

  // REP-01C (D-REP6) — separate method, same reasoning as above: keeps
  // the includeDeleted opt-in from reaching getCustomers()'s other
  // existing callers. Used only by getCustomerRegisterReport.
  async getCustomersForRegister(franchiseId?: string, includeDeleted = false) {
    const where: any = includeDeleted ? {} : { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    return db.customer.findMany({ where, orderBy: { lastVisit: 'desc' } });
  }

  async getEmployees(franchiseId?: string) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    return db.employee.findMany({ where });
  }

  // REP-01A — used to fix getAttendanceReport, which previously hardcoded
  // attendanceToday: 'Present' / daysWorkedThisMonth: 22 for every employee
  // and never queried this table at all. Same shape already used by
  // hq.ts's employee performance report (status-filtered Attendance rows
  // in a date range) — reused, not reinvented.
  async getAttendanceForEmployees(employeeIds: string[], from: Date, to: Date) {
    if (employeeIds.length === 0) return [];
    return db.attendance.findMany({
      where: { employeeId: { in: employeeIds }, date: { gte: from, lte: to }, isDeleted: false },
    });
  }

  // REP-01C — used by the new canonical Employee Performance Report
  // (§16.8), which consolidates hq.ts's/leadReport.service.ts's duplicate
  // implementations. Needs the franchise name for display, unlike the
  // plain getEmployees() above.
  async getEmployeesWithFranchise(franchiseId?: string) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    return db.employee.findMany({ where, include: { franchise: true } });
  }

  async getAttendanceCountForEmployee(employeeId: string, status: string, from: Date) {
    return db.attendance.count({ where: { employeeId, date: { gte: from }, status, isDeleted: false } });
  }

  async getJobsForEmployeePerformance(employeeId: string, from: Date) {
    return db.job.findMany({
      where: {
        OR: [{ technicianId: employeeId }, { serviceAdvisorId: employeeId }],
        createdAt: { gte: from },
        isDeleted: false,
      },
    });
  }

  async getLeadsForEmployeePerformance(employeeName: string, from: Date) {
    return db.lead.findMany({ where: { assignedTo: employeeName || "", date: { gte: from }, isDeleted: false } });
  }

  async getInvoicesForEmployeePerformance(jobIds: string[], customerNames: string[], from: Date) {
    return db.invoice.findMany({
      where: {
        OR: [{ id: { in: jobIds } }, { client: { in: customerNames } }],
        date: { gte: from },
        isDeleted: false,
      },
    });
  }

  // INV-05 — this fell out of sync with INV-02, which gave InventoryMovement
  // its own franchiseId column (populated on every new write; DISPATCH
  // carries the *destination* franchise even though its itemId belongs to
  // HQ's item) and updated the live /inventory/movements endpoint to match,
  // but never propagated the same fix here — so the Stock Ledger report
  // was still using the pre-INV-02 itemId-only join and silently missed
  // DISPATCH movements now correctly tagged to a receiving franchise.
  // Mirrors resolveMovementScope's OR condition (movementScope.helper.ts):
  // explicitly tagged as mine, OR a legacy untagged row on an item that
  // currently belongs to me.
  // INV-06A — added optional from/to bounding (the Ledger previously
  // fetched the entire, ever-growing movement history unbounded, unlike
  // every other report in this module). The date filter is applied
  // alongside the existing INV-05 franchise-scope OR condition, not in
  // place of it.
  // INV-06B — added optional `types` so the Dispatch Report and Stock
  // Movement Report can reuse this exact same scope+date-bounded query
  // (filtered to `['DISPATCH']`, or left undefined for every type) instead
  // of a second movement-fetching implementation.
  async getInventoryMovements(franchiseId?: string, from?: Date, to?: Date, types?: string[]) {
    const dateWhere: any = {};
    if (from || to) {
      dateWhere.performedAt = {};
      if (from) dateWhere.performedAt.gte = from;
      if (to) dateWhere.performedAt.lte = to;
    }
    const typeWhere: any = types && types.length > 0 ? { type: { in: types } } : {};

    if (franchiseId) {
      const scopedItemIds = (await db.inventory.findMany({
        where: { franchiseId, isDeleted: false },
        select: { id: true }
      })).map(i => i.id);
      return db.inventoryMovement.findMany({
        where: {
          ...dateWhere,
          ...typeWhere,
          OR: [
            { franchiseId },
            { franchiseId: null, itemId: { in: scopedItemIds } },
          ],
        },
        orderBy: { performedAt: 'desc' }
      });
    }
    return db.inventoryMovement.findMany({
      where: { ...dateWhere, ...typeWhere },
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

  // REP-01C — canonical Referral Report (§16.6). Referral carries its own
  // franchiseId, same scoping pattern as getLeadsInRange above.
  async getReferralsInRange(franchiseId?: string, from?: Date, to?: Date) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.referralDate = {};
      if (from) where.referralDate.gte = from;
      if (to) where.referralDate.lte = to;
    }
    return db.referral.findMany({ where, orderBy: { referralDate: 'desc' } });
  }

  // REP-01C — canonical Service Due Follow-up Report (§16.6). ServiceReminder
  // has no franchiseId column of its own, so scoping goes through its
  // required Customer relation (same technique WTY-01A used for Warranty).
  async getServiceDueReminders(franchiseId?: string) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.customer = { franchiseId };
    return db.serviceReminder.findMany({ where, include: { customer: true }, orderBy: { scheduledDate: 'asc' } });
  }

  // REP-01C — canonical Leave Report (§16.8), the "missing report"
  // identified in REP-01 (no Leave Report existed anywhere, only the raw
  // LeaveRequest CRUD in the employee module).
  async getLeaveRequestsInRange(franchiseId?: string, from?: Date, to?: Date) {
    const where: any = { isDeleted: false };
    if (franchiseId) where.franchiseId = franchiseId;
    if (from || to) {
      where.startDate = {};
      if (from) where.startDate.gte = from;
      if (to) where.startDate.lte = to;
    }
    return db.leaveRequest.findMany({ where, include: { employee: true }, orderBy: { startDate: 'desc' } });
  }
}
