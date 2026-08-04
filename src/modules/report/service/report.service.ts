import { ReportRepository } from '../repository/report.repository.js';
import { COMPLETED_JOB_STATUSES } from '../../../shared/constants/jobStatus.constants.js';

// ─── CSV Helpers ──────────────────────────────────────────────────────────────

function toCsv(rows: any[], columns: { key: string; label: string }[]): string {
  const header = columns.map(c => `"${c.label}"`).join(',');
  const lines = rows.map(row =>
    columns.map(c => {
      const val = row[c.key] ?? '';
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

function parseDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ReportService {
  constructor(private readonly repository: ReportRepository = new ReportRepository()) {}

  // ─── Existing ERP Summary ─────────────────────────────────────────────────

  async getReports(franchiseId?: string) {
    const [invoices, payments, leads, jobs, inventory, franchises] = await Promise.all([
      this.repository.getInvoices(franchiseId),
      this.repository.getPayments(franchiseId),
      this.repository.getLeads(franchiseId),
      this.repository.getJobs(franchiseId),
      this.repository.getInventory(franchiseId),
      this.repository.getFranchises(franchiseId),
    ]);

    const totalInvoiced = invoices.reduce((sum, i) => sum + (i.amount + i.gst - i.discount), 0);
    const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);

    const statusMap: Record<string, { amount: number; count: number }> = {};
    invoices.forEach(i => {
      const entry = statusMap[i.status] || { amount: 0, count: 0 };
      entry.amount += i.amount + i.gst - i.discount;
      entry.count += 1;
      statusMap[i.status] = entry;
    });
    const billingData = Object.entries(statusMap).map(([status, data]) => ({ status, ...data }));

    const serviceMap: Record<string, number> = {};
    let totalServiceRevenue = 0;
    invoices.forEach(i => {
      const s = i.service || 'General';
      if (!serviceMap[s]) serviceMap[s] = 0;
      const val = i.amount + i.gst - i.discount;
      serviceMap[s] += val;
      totalServiceRevenue += val;
    });
    const serviceRevenue = Object.entries(serviceMap)
      .map(([service, amount]) => ({
        service,
        amount,
        percentage: totalServiceRevenue > 0 ? Math.round((amount / totalServiceRevenue) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const sourceMap: Record<string, number> = {};
    leads.forEach(l => { sourceMap[l.source || 'Other'] = (sourceMap[l.source || 'Other'] || 0) + 1; });
    const totalLeads = leads.length;
    const leadSources = Object.entries(sourceMap)
      .map(([source, count]) => ({
        source,
        count,
        percentage: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
    const convertedLeads = leads.filter(l => ['Converted', 'Won', 'Closed'].includes(l.status)).length;
    const leadConversion = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

    const jobStatusMap: Record<string, number> = {};
    jobs.forEach(j => { jobStatusMap[j.status] = (jobStatusMap[j.status] || 0) + 1; });
    const jobSummary = Object.entries(jobStatusMap).map(([status, count]) => {
      let color = 'bg-gray-100 text-gray-700';
      if (status === 'Completed') color = 'bg-green-100 text-green-700';
      if (status === 'Pending') color = 'bg-yellow-100 text-yellow-700';
      if (status === 'In Progress') color = 'bg-blue-100 text-blue-700';
      if (status === 'Cancelled') color = 'bg-red-100 text-red-700';
      return { status, count, color };
    });

    const inventoryMap: Record<string, { value: number; items: number }> = {};
    inventory.forEach(i => {
      const c = i.category || 'General';
      if (!inventoryMap[c]) inventoryMap[c] = { value: 0, items: 0 };
      inventoryMap[c].value += i.stock * i.cost;
      inventoryMap[c].items += i.stock;
    });
    const inventoryValue = Object.entries(inventoryMap).map(([category, data]) => ({ category, ...data }));

    const franchiseRevenue = franchises.reduce((sum, f) => sum + f.revenue, 0);

    return { billingData, serviceRevenue, leadSources, jobSummary, inventoryValue, totalInvoiced, totalCollected, leadConversion, franchiseRevenue };
  }

  // ─── Billing Reports (§13.13) ───────────────────────────────────────────────

  private invoiceNet(i: { amount: number; gst: number; discount: number }): number {
    return i.amount + i.gst - i.discount;
  }

  async getInvoiceRegisterReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to));
    return rows.map(i => ({
      invoiceNo: i.id,
      type: i.type,
      date: i.date?.toISOString().split('T')[0] ?? '',
      customer: i.client,
      phone: i.phone,
      vehicle: i.vehicle,
      service: i.service,
      amount: i.amount,
      gst: i.gst,
      discount: i.discount,
      total: this.invoiceNet(i),
      status: i.status,
      jobCardNo: i.jobId ?? '',
    }));
  }

  async getDailySalesReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to));
    const byDay = new Map<string, { count: number; total: number }>();
    rows.filter(i => i.status !== 'Cancelled').forEach(i => {
      const day = i.date?.toISOString().split('T')[0] ?? 'Unknown';
      const entry = byDay.get(day) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += this.invoiceNet(i);
      byDay.set(day, entry);
    });
    return Array.from(byDay.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getMonthlySalesReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to));
    const byMonth = new Map<string, { count: number; total: number }>();
    rows.filter(i => i.status !== 'Cancelled').forEach(i => {
      const month = i.date?.toISOString().slice(0, 7) ?? 'Unknown';
      const entry = byMonth.get(month) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += this.invoiceNet(i);
      byMonth.set(month, entry);
    });
    return Array.from(byMonth.entries())
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  async getCustomerWiseRevenueReport(franchiseId?: string, from?: string, to?: string) {
    // No customerId FK on Invoice — grouped by client name, case-insensitive (same
    // limitation the frontend already has joining jobs/invoices by vehicle string).
    const rows = await this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to));
    const byCustomer = new Map<string, { customer: string; invoiceCount: number; total: number }>();
    rows.filter(i => i.status !== 'Cancelled').forEach(i => {
      const key = (i.client || 'Unknown').trim().toLowerCase();
      const entry = byCustomer.get(key) || { customer: i.client || 'Unknown', invoiceCount: 0, total: 0 };
      entry.invoiceCount += 1;
      entry.total += this.invoiceNet(i);
      byCustomer.set(key, entry);
    });
    return Array.from(byCustomer.values()).sort((a, b) => b.total - a.total);
  }

  async getFranchiseWiseRevenueReport(franchiseId?: string, from?: string, to?: string) {
    const [rows, franchises] = await Promise.all([
      this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to)),
      this.repository.getFranchises(franchiseId),
    ]);
    const franchiseNames = new Map(franchises.map(f => [f.id, f.name]));
    const byFranchise = new Map<string, { invoiceCount: number; total: number }>();
    rows.filter(i => i.status !== 'Cancelled').forEach(i => {
      const key = i.franchiseId || 'Unassigned';
      const entry = byFranchise.get(key) || { invoiceCount: 0, total: 0 };
      entry.invoiceCount += 1;
      entry.total += this.invoiceNet(i);
      byFranchise.set(key, entry);
    });
    return Array.from(byFranchise.entries())
      .map(([id, data]) => ({ franchiseId: id, franchiseName: franchiseNames.get(id) ?? id, ...data }))
      .sort((a, b) => b.total - a.total);
  }

  async getGstSummaryReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to));
    const byMonth = new Map<string, { taxableAmount: number; gst: number; invoiceCount: number }>();
    rows.filter(i => i.status !== 'Cancelled').forEach(i => {
      const month = i.date?.toISOString().slice(0, 7) ?? 'Unknown';
      const entry = byMonth.get(month) || { taxableAmount: 0, gst: 0, invoiceCount: 0 };
      entry.taxableAmount += i.amount - i.discount;
      entry.gst += i.gst;
      entry.invoiceCount += 1;
      byMonth.set(month, entry);
    });
    return Array.from(byMonth.entries())
      .map(([month, data]) => ({
        month,
        ...data,
        cgst: Math.round((data.gst / 2) * 100) / 100,
        sgst: Math.round((data.gst / 2) * 100) / 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  async exportBillingCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    const columnSets: Record<string, { key: string; label: string }[]> = {
      register: [
        { key: 'invoiceNo', label: 'Invoice No' },
        { key: 'type', label: 'Type' },
        { key: 'date', label: 'Date' },
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'amount', label: 'Amount' },
        { key: 'gst', label: 'GST' },
        { key: 'discount', label: 'Discount' },
        { key: 'total', label: 'Total' },
        { key: 'status', label: 'Status' },
        { key: 'jobCardNo', label: 'Job Card No' },
      ],
      'daily-sales': [
        { key: 'date', label: 'Date' },
        { key: 'count', label: 'Invoice Count' },
        { key: 'total', label: 'Total Revenue' },
      ],
      'monthly-sales': [
        { key: 'month', label: 'Month' },
        { key: 'count', label: 'Invoice Count' },
        { key: 'total', label: 'Total Revenue' },
      ],
      'customer-wise': [
        { key: 'customer', label: 'Customer' },
        { key: 'invoiceCount', label: 'Invoice Count' },
        { key: 'total', label: 'Total Revenue' },
      ],
      'franchise-wise': [
        { key: 'franchiseId', label: 'Franchise ID' },
        { key: 'franchiseName', label: 'Franchise' },
        { key: 'invoiceCount', label: 'Invoice Count' },
        { key: 'total', label: 'Total Revenue' },
      ],
      'gst-summary': [
        { key: 'month', label: 'Month' },
        { key: 'invoiceCount', label: 'Invoice Count' },
        { key: 'taxableAmount', label: 'Taxable Amount' },
        { key: 'gst', label: 'Total GST' },
        { key: 'cgst', label: 'CGST' },
        { key: 'sgst', label: 'SGST' },
      ],
    };

    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];

    switch (type) {
      case 'register':        rows = await this.getInvoiceRegisterReport(franchiseId, from, to); break;
      case 'daily-sales':     rows = await this.getDailySalesReport(franchiseId, from, to); break;
      case 'monthly-sales':   rows = await this.getMonthlySalesReport(franchiseId, from, to); break;
      case 'customer-wise':   rows = await this.getCustomerWiseRevenueReport(franchiseId, from, to); break;
      case 'franchise-wise':  rows = await this.getFranchiseWiseRevenueReport(franchiseId, from, to); break;
      case 'gst-summary':     rows = await this.getGstSummaryReport(franchiseId, from, to); break;
      default: throw new Error(`Unknown report type: ${type}`);
    }

    const columns = columnSets[type]!;
    const csv = toCsv(rows, columns);
    const filename = `billing_${type}_${today}.csv`;

    return { csv, filename };
  }

  // ─── Reception Reports ────────────────────────────────────────────────────

  async getAppointmentReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getAppointments(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      appointmentNo: r.id,
      date: r.scheduledDate?.toISOString().split('T')[0] ?? '',
      time: r.scheduledDate?.toISOString().split('T')[1]?.slice(0, 5) ?? '',
      customer: r.customerName,
      vehicle: r.vehicle,
      service: r.service,
      assignedStaff: r.assignedStaff ?? '',
      status: r.status,
      branch: r.franchiseId ?? '',
    }));
  }

  async getWalkInReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getWalkIns(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      checkInNo: r.id,
      date: r.inTime?.toISOString().split('T')[0] ?? '',
      time: r.inTime?.toISOString().split('T')[1]?.slice(0, 5) ?? '',
      customer: r.customer,
      phone: r.phone,
      vehicle: r.vehicle,
      service: r.service,
      receivedBy: r.receivedByName ?? '',
      odometer: r.odometer,
      status: r.status,
    }));
  }

  async getCheckinReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getCheckins(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      checkInNo: r.id,
      jobCardNo: r.jobCardId,
      date: r.inTime?.toISOString().split('T')[0] ?? '',
      customer: r.customer,
      phone: r.phone,
      vehicle: r.vehicle,
      model: r.model,
      service: r.service,
      odometer: r.odometer,
      fuelLevel: r.fuelLevel ?? '',
      keyCount: r.keyCount ?? 1,
      receivedBy: r.receivedByName ?? '',
      expectedDelivery: r.expectedDelivery?.toISOString().split('T')[0] ?? '',
      status: r.status,
    }));
  }

  async getDeliveryReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getDeliveries(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      checkInNo: r.id,
      jobCardNo: r.jobCardId,
      checkInDate: r.inTime?.toISOString().split('T')[0] ?? '',
      checkOutDate: r.checkOutAt?.toISOString().split('T')[0] ?? '',
      checkOutTime: r.checkOutAt?.toISOString().split('T')[1]?.slice(0, 5) ?? '',
      customer: r.customer,
      vehicle: r.vehicle,
      service: r.service,
      deliveredBy: r.checkOutByName ?? '',
      customerAcknowledgement: r.customerAcknowledgement ?? '',
    }));
  }

  async getReceptionRegister(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getReceptionRegister(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      id: r.id,
      jobCardNo: r.jobCardId,
      checkInDate: r.inTime?.toISOString().split('T')[0] ?? '',
      customer: r.customer,
      phone: r.phone,
      vehicle: r.vehicle,
      service: r.service,
      receivedBy: r.receivedByName ?? '',
      status: r.status,
      deliveryDate: r.checkOutAt?.toISOString().split('T')[0] ?? '',
      deliveredBy: r.checkOutByName ?? '',
    }));
  }

  async getPendingVehicleReport(franchiseId?: string) {
    const rows = await this.repository.getPendingVehicles(franchiseId);
    const now = new Date();
    return rows.map(r => {
      const inTime = r.inTime ? new Date(r.inTime) : now;
      const daysInWorkshop = Math.floor((now.getTime() - inTime.getTime()) / (1000 * 60 * 60 * 24));
      const expectedDelivery = r.expectedDelivery ? new Date(r.expectedDelivery) : null;
      const isOverdue = expectedDelivery && now > expectedDelivery;
      return {
        id: r.id,
        jobCardNo: r.jobCardId,
        checkInDate: r.inTime?.toISOString().split('T')[0] ?? '',
        customer: r.customer,
        phone: r.phone,
        vehicle: r.vehicle,
        service: r.service,
        expectedDelivery: r.expectedDelivery?.toISOString().split('T')[0] ?? 'Not Set',
        daysInWorkshop,
        isOverdue: isOverdue ? 'Yes' : 'No',
        status: r.status,
      };
    });
  }

  async getDailyMovementReport(franchiseId?: string, date?: string) {
    const rows = await this.repository.getDailyMovement(franchiseId, parseDate(date));
    return rows.map(r => ({
      id: r.id,
      customer: r.customer,
      vehicle: r.vehicle,
      service: r.service,
      checkIn: r.inTime?.toISOString().split('T')[1]?.slice(0, 5) ?? '',
      checkOut: r.checkOutAt?.toISOString().split('T')[1]?.slice(0, 5) ?? '',
      receivedBy: r.receivedByName ?? '',
      deliveredBy: r.checkOutByName ?? '',
      status: r.status,
    }));
  }

  // ─── Workshop Reports (PRD §10.12) ─────────────────────────────────────────

  async getWorkProgressReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getWorkshopJobs(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      jobCardNo: r.id,
      customer: r.customer,
      vehicle: r.vehicle,
      service: r.service,
      technician: r.technician,
      priority: r.priority,
      status: r.status,
      estCompletion: r.estCompletion?.toISOString().split('T')[0] ?? '',
    }));
  }

  async getEmployeeWorkloadReport(franchiseId?: string) {
    const [technicians, jobs] = await Promise.all([
      this.repository.getTechnicians(franchiseId),
      this.repository.getWorkshopJobs(franchiseId),
    ]);
    const isCompleted = (s: string) => COMPLETED_JOB_STATUSES.includes(s);
    return technicians.map(t => {
      const empJobs = jobs.filter(j => j.technicianId === t.id);
      return {
        employeeId: t.id,
        employeeName: t.name,
        assignedJobs: empJobs.length,
        inProgress: empJobs.filter(j => j.status === 'In Progress').length,
        completed: empJobs.filter(j => isCompleted(j.status)).length,
        rework: empJobs.filter(j => j.isRework).length,
      };
    });
  }

  async getCompletedJobsReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getWorkshopJobs(franchiseId, parseDate(from), parseDate(to));
    return rows
      .filter(r => COMPLETED_JOB_STATUSES.includes(r.status))
      .map(r => ({
        jobCardNo: r.id,
        customer: r.customer,
        vehicle: r.vehicle,
        service: r.service,
        technician: r.technician,
        startDate: r.startDate?.toISOString().split('T')[0] ?? '',
        actualCompletion: r.actualCompletion?.toISOString().split('T')[0] ?? '',
      }));
  }

  async getPendingJobsReport(franchiseId?: string) {
    const rows = await this.repository.getWorkshopJobs(franchiseId);
    const now = new Date();
    return rows
      .filter(r => !COMPLETED_JOB_STATUSES.includes(r.status))
      .map(r => ({
        jobCardNo: r.id,
        customer: r.customer,
        vehicle: r.vehicle,
        service: r.service,
        technician: r.technician,
        status: r.status,
        estCompletion: r.estCompletion?.toISOString().split('T')[0] ?? '',
        isOverdue: r.estCompletion && now > r.estCompletion ? 'Yes' : 'No',
      }));
  }

  async getMaterialConsumptionReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getMaterialConsumptions(franchiseId, parseDate(from), parseDate(to));
    return rows.map(r => ({
      jobCardNo: r.jobId,
      item: r.itemName,
      quantity: r.quantity,
      unit: r.unit ?? '',
      status: r.status,
      recordedBy: r.recordedBy ?? '',
      approvedBy: r.approvedBy ?? '',
      date: r.createdAt?.toISOString().split('T')[0] ?? '',
    }));
  }

  async getDelayAnalysisReport(franchiseId?: string) {
    const rows = await this.repository.getWorkshopJobs(franchiseId);
    const now = new Date();
    return rows
      .map(r => {
        const isCompleted = COMPLETED_JOB_STATUSES.includes(r.status);
        const end = isCompleted ? (r.actualCompletion ?? now) : now;
        const delayMs = end.getTime() - r.estCompletion.getTime();
        return { r, delayMs, isCompleted };
      })
      .filter(({ delayMs }) => delayMs > 0)
      .map(({ r, delayMs, isCompleted }) => ({
        jobCardNo: r.id,
        customer: r.customer,
        vehicle: r.vehicle,
        technician: r.technician,
        estCompletion: r.estCompletion?.toISOString().split('T')[0] ?? '',
        status: r.status,
        delayHours: Math.round(delayMs / (1000 * 60 * 60)),
        stillOpen: isCompleted ? 'No' : 'Yes',
      }));
  }

  // ─── QC Reports (PRD §12.9) ─────────────────────────────────────────────────

  private async getQcInspectionsWithJobs(franchiseId?: string, from?: string, to?: string) {
    const inspections = await this.repository.getQcInspections(franchiseId, parseDate(from), parseDate(to));
    const jobIds = [...new Set(inspections.map(i => i.jobId))];
    const jobs = jobIds.length > 0
      ? await this.repository.getWorkshopJobs(franchiseId)
      : [];
    const jobMap = new Map(jobs.map(j => [j.id, j]));
    return inspections.map(i => ({ inspection: i, job: jobMap.get(i.jobId) }));
  }

  async getQcRegisterReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.getQcInspectionsWithJobs(franchiseId, from, to);
    return rows.map(({ inspection: i, job }) => ({
      jobCardNo: i.jobId,
      vehicle: job?.vehicle ?? '',
      customer: job?.customer ?? '',
      attempt: i.attemptNumber,
      inspector: i.inspectorName ?? '',
      scheduledAt: i.scheduledAt?.toISOString().split('T')[0] ?? '',
      result: i.result,
      decidedAt: i.decidedAt?.toISOString().split('T')[0] ?? '',
    }));
  }

  async getPassedVehiclesReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.getQcInspectionsWithJobs(franchiseId, from, to);
    return rows
      .filter(({ inspection }) => inspection.result === 'Passed')
      .map(({ inspection: i, job }) => ({
        jobCardNo: i.jobId,
        vehicle: job?.vehicle ?? '',
        customer: job?.customer ?? '',
        inspector: i.inspectorName ?? '',
        decidedAt: i.decidedAt?.toISOString().split('T')[0] ?? '',
      }));
  }

  async getFailedVehiclesReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.getQcInspectionsWithJobs(franchiseId, from, to);
    return rows
      .filter(({ inspection }) => inspection.result === 'Failed')
      .map(({ inspection: i, job }) => ({
        jobCardNo: i.jobId,
        vehicle: job?.vehicle ?? '',
        customer: job?.customer ?? '',
        inspector: i.inspectorName ?? '',
        reason: i.reason ?? '',
        decidedAt: i.decidedAt?.toISOString().split('T')[0] ?? '',
      }));
  }

  async getReworkReport(franchiseId?: string) {
    const jobs = await this.repository.getWorkshopJobs(franchiseId);
    return jobs
      .filter(j => j.reworkCount > 0)
      .map(j => ({
        jobCardNo: j.id,
        vehicle: j.vehicle,
        customer: j.customer,
        technician: j.technician,
        reworkCount: j.reworkCount,
        qcAttempts: j.qcAttemptCount,
        status: j.status,
      }));
  }

  async getQcPerformanceReport(franchiseId?: string, from?: string, to?: string) {
    const [inspectors, inspections] = await Promise.all([
      this.repository.getQualityInspectors(franchiseId),
      this.repository.getQcInspections(franchiseId, parseDate(from), parseDate(to)),
    ]);
    return inspectors.map(insp => {
      const own = inspections.filter(i => i.inspectorId === insp.id);
      const decided = own.filter(i => i.result !== 'Pending');
      const passed = own.filter(i => i.result === 'Passed').length;
      const failed = own.filter(i => i.result === 'Failed').length;
      const avgDecisionHours = decided.length > 0
        ? decided.reduce((sum, i) => {
            if (!i.decidedAt) return sum;
            return sum + (i.decidedAt.getTime() - i.createdAt.getTime()) / (1000 * 60 * 60);
          }, 0) / decided.length
        : 0;
      return {
        inspectorId: insp.id,
        inspectorName: insp.name,
        totalAttempts: own.length,
        passed,
        failed,
        passRate: (passed + failed) > 0 ? Math.round((passed / (passed + failed)) * 100) : 0,
        avgDecisionHours: Math.round(avgDecisionHours * 10) / 10,
      };
    });
  }

  async getEmployeeReworkReport(franchiseId?: string) {
    const jobs = await this.repository.getWorkshopJobs(franchiseId);
    const byTechnician = new Map<string, { technicianId: string; technician: string; assignedJobs: number; reworkCount: number }>();
    for (const j of jobs) {
      const key = j.technicianId || j.technician || 'Unassigned';
      const entry = byTechnician.get(key) || { technicianId: j.technicianId ?? '', technician: j.technician, assignedJobs: 0, reworkCount: 0 };
      entry.assignedJobs++;
      entry.reworkCount += j.reworkCount;
      byTechnician.set(key, entry);
    }
    return Array.from(byTechnician.values());
  }

  async getBranchQcReport() {
    const [franchises, inspections] = await Promise.all([
      this.repository.getFranchises(),
      this.repository.getQcInspections(),
    ]);
    return franchises.map(f => {
      const own = inspections.filter(i => i.franchiseId === f.id);
      const passed = own.filter(i => i.result === 'Passed').length;
      const failed = own.filter(i => i.result === 'Failed').length;
      return {
        franchiseId: f.id,
        franchiseName: f.name,
        totalInspections: own.length,
        passed,
        failed,
        passRate: (passed + failed) > 0 ? Math.round((passed / (passed + failed)) * 100) : 0,
      };
    });
  }

  // ─── CSV Export (QC) ────────────────────────────────────────────────────────

  async exportQcCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    const columnSets: Record<string, { key: string; label: string }[]> = {
      register: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'customer', label: 'Customer' },
        { key: 'attempt', label: 'Attempt' },
        { key: 'inspector', label: 'Inspector' },
        { key: 'scheduledAt', label: 'Scheduled' },
        { key: 'result', label: 'Result' },
        { key: 'decidedAt', label: 'Decided On' },
      ],
      passed: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'customer', label: 'Customer' },
        { key: 'inspector', label: 'Inspector' },
        { key: 'decidedAt', label: 'Decided On' },
      ],
      failed: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'customer', label: 'Customer' },
        { key: 'inspector', label: 'Inspector' },
        { key: 'reason', label: 'Reason' },
        { key: 'decidedAt', label: 'Decided On' },
      ],
      rework: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'customer', label: 'Customer' },
        { key: 'technician', label: 'Technician' },
        { key: 'reworkCount', label: 'Rework Count' },
        { key: 'qcAttempts', label: 'QC Attempts' },
        { key: 'status', label: 'Status' },
      ],
      performance: [
        { key: 'inspectorId', label: 'Inspector ID' },
        { key: 'inspectorName', label: 'Inspector Name' },
        { key: 'totalAttempts', label: 'Total Attempts' },
        { key: 'passed', label: 'Passed' },
        { key: 'failed', label: 'Failed' },
        { key: 'passRate', label: 'Pass Rate %' },
        { key: 'avgDecisionHours', label: 'Avg Decision Time (hrs)' },
      ],
      'employee-rework': [
        { key: 'technicianId', label: 'Technician ID' },
        { key: 'technician', label: 'Technician' },
        { key: 'assignedJobs', label: 'Assigned Jobs' },
        { key: 'reworkCount', label: 'Rework Count' },
      ],
      branch: [
        { key: 'franchiseId', label: 'Franchise ID' },
        { key: 'franchiseName', label: 'Franchise' },
        { key: 'totalInspections', label: 'Total Inspections' },
        { key: 'passed', label: 'Passed' },
        { key: 'failed', label: 'Failed' },
        { key: 'passRate', label: 'Pass Rate %' },
      ],
    };

    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];

    switch (type) {
      case 'register':         rows = await this.getQcRegisterReport(franchiseId, from, to); break;
      case 'passed':           rows = await this.getPassedVehiclesReport(franchiseId, from, to); break;
      case 'failed':           rows = await this.getFailedVehiclesReport(franchiseId, from, to); break;
      case 'rework':           rows = await this.getReworkReport(franchiseId); break;
      case 'performance':      rows = await this.getQcPerformanceReport(franchiseId, from, to); break;
      case 'employee-rework':  rows = await this.getEmployeeReworkReport(franchiseId); break;
      case 'branch':           rows = await this.getBranchQcReport(); break;
      default: throw new Error(`Unknown report type: ${type}`);
    }

    const columns = columnSets[type]!;
    const csv = toCsv(rows, columns);
    const filename = `qc_${type}_${today}.csv`;

    return { csv, filename };
  }

  // ─── CSV Export ────────────────────────────────────────────────────────────

  async exportWorkshopCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    const columnSets: Record<string, { key: string; label: string }[]> = {
      progress: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'technician', label: 'Technician' },
        { key: 'priority', label: 'Priority' },
        { key: 'status', label: 'Status' },
        { key: 'estCompletion', label: 'Estimated Completion' },
      ],
      workload: [
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'employeeName', label: 'Employee Name' },
        { key: 'assignedJobs', label: 'Assigned Jobs' },
        { key: 'inProgress', label: 'In Progress' },
        { key: 'completed', label: 'Completed' },
        { key: 'rework', label: 'Rework' },
      ],
      completed: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'technician', label: 'Technician' },
        { key: 'startDate', label: 'Start Date' },
        { key: 'actualCompletion', label: 'Completed On' },
      ],
      pending: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'technician', label: 'Technician' },
        { key: 'status', label: 'Status' },
        { key: 'estCompletion', label: 'Estimated Completion' },
        { key: 'isOverdue', label: 'Overdue?' },
      ],
      materials: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'item', label: 'Item' },
        { key: 'quantity', label: 'Quantity' },
        { key: 'unit', label: 'Unit' },
        { key: 'status', label: 'Status' },
        { key: 'recordedBy', label: 'Recorded By' },
        { key: 'approvedBy', label: 'Approved By' },
        { key: 'date', label: 'Date' },
      ],
      delays: [
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'technician', label: 'Technician' },
        { key: 'estCompletion', label: 'Estimated Completion' },
        { key: 'status', label: 'Status' },
        { key: 'delayHours', label: 'Delay (Hours)' },
        { key: 'stillOpen', label: 'Still Open?' },
      ],
    };

    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];

    switch (type) {
      case 'progress':  rows = await this.getWorkProgressReport(franchiseId, from, to); break;
      case 'workload':  rows = await this.getEmployeeWorkloadReport(franchiseId);       break;
      case 'completed': rows = await this.getCompletedJobsReport(franchiseId, from, to); break;
      case 'pending':   rows = await this.getPendingJobsReport(franchiseId);            break;
      case 'materials': rows = await this.getMaterialConsumptionReport(franchiseId, from, to); break;
      case 'delays':    rows = await this.getDelayAnalysisReport(franchiseId);          break;
      default: throw new Error(`Unknown report type: ${type}`);
    }

    const columns = columnSets[type]!;
    const csv = toCsv(rows, columns);
    const filename = `workshop_${type}_${today}.csv`;

    return { csv, filename };
  }

  // ─── CSV Export (Reception) ────────────────────────────────────────────────

  async exportReceptionCsv(type: string, franchiseId?: string, from?: string, to?: string, date?: string): Promise<{ csv: string; filename: string }> {
    const columnSets: Record<string, { key: string; label: string }[]> = {
      appointments: [
        { key: 'appointmentNo', label: 'Appointment No' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'assignedStaff', label: 'Assigned Staff' },
        { key: 'status', label: 'Status' },
        { key: 'branch', label: 'Branch' },
      ],
      walkins: [
        { key: 'checkInNo', label: 'Check-In No' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'receivedBy', label: 'Received By' },
        { key: 'odometer', label: 'Odometer' },
        { key: 'status', label: 'Status' },
      ],
      checkins: [
        { key: 'checkInNo', label: 'Check-In No' },
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'date', label: 'Date' },
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'model', label: 'Model' },
        { key: 'service', label: 'Service' },
        { key: 'odometer', label: 'Odometer' },
        { key: 'fuelLevel', label: 'Fuel Level' },
        { key: 'keyCount', label: 'Key Count' },
        { key: 'receivedBy', label: 'Received By' },
        { key: 'expectedDelivery', label: 'Expected Delivery' },
        { key: 'status', label: 'Status' },
      ],
      deliveries: [
        { key: 'checkInNo', label: 'Check-In No' },
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'checkInDate', label: 'Check-In Date' },
        { key: 'checkOutDate', label: 'Delivery Date' },
        { key: 'checkOutTime', label: 'Delivery Time' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'deliveredBy', label: 'Delivered By' },
        { key: 'customerAcknowledgement', label: 'Customer Acknowledgement' },
      ],
      register: [
        { key: 'id', label: 'ID' },
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'checkInDate', label: 'Check-In Date' },
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'receivedBy', label: 'Received By' },
        { key: 'status', label: 'Status' },
        { key: 'deliveryDate', label: 'Delivery Date' },
        { key: 'deliveredBy', label: 'Delivered By' },
      ],
      pending: [
        { key: 'id', label: 'ID' },
        { key: 'jobCardNo', label: 'Job Card No' },
        { key: 'checkInDate', label: 'Check-In Date' },
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'expectedDelivery', label: 'Expected Delivery' },
        { key: 'daysInWorkshop', label: 'Days in Workshop' },
        { key: 'isOverdue', label: 'Overdue?' },
        { key: 'status', label: 'Status' },
      ],
      daily: [
        { key: 'id', label: 'ID' },
        { key: 'customer', label: 'Customer' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'checkIn', label: 'Check-In Time' },
        { key: 'checkOut', label: 'Check-Out Time' },
        { key: 'receivedBy', label: 'Received By' },
        { key: 'deliveredBy', label: 'Delivered By' },
        { key: 'status', label: 'Status' },
      ],
    };

    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];

    switch (type) {
      case 'appointments': rows = await this.getAppointmentReport(franchiseId, from, to); break;
      case 'walkins':      rows = await this.getWalkInReport(franchiseId, from, to);      break;
      case 'checkins':     rows = await this.getCheckinReport(franchiseId, from, to);     break;
      case 'deliveries':   rows = await this.getDeliveryReport(franchiseId, from, to);   break;
      case 'register':     rows = await this.getReceptionRegister(franchiseId, from, to); break;
      case 'pending':      rows = await this.getPendingVehicleReport(franchiseId);        break;
      case 'daily':        rows = await this.getDailyMovementReport(franchiseId, date);  break;
      default: throw new Error(`Unknown report type: ${type}`);
    }

    const columns = columnSets[type]!;
    const csv = toCsv(rows, columns);
    const filename = `reception_${type}_${today}.csv`;

    return { csv, filename };
  }

  // ─── HQ & Franchise Dashboard Summary (PRD §16.3 & §16.4) ────────────────────

  async getHQSummary(franchiseId?: string) {
    const [invoices, payments, leads, jobs, inventory, franchises, employees, customers] = await Promise.all([
      this.repository.getInvoices(franchiseId),
      this.repository.getPayments(franchiseId),
      this.repository.getLeads(franchiseId),
      this.repository.getJobs(franchiseId),
      this.repository.getInventory(franchiseId),
      this.repository.getFranchises(franchiseId),
      this.repository.getEmployees(franchiseId),
      this.repository.getCustomers(franchiseId),
    ]);

    const todayStr = new Date().toISOString().split('T')[0] || '';
    const monthStr = todayStr.slice(0, 7);

    const todayRevenue = invoices
      .filter(i => (i.date?.toISOString().split('T')[0] === todayStr) && i.status !== 'Cancelled')
      .reduce((sum, i) => sum + this.invoiceNet(i), 0);

    const monthlyRevenue = invoices
      .filter(i => (i.date?.toISOString().slice(0, 7) === monthStr) && i.status !== 'Cancelled')
      .reduce((sum, i) => sum + this.invoiceNet(i), 0);

    const outstandingPayments = invoices
      .filter(i => i.status !== 'Paid' && i.status !== 'Cancelled')
      .reduce((sum, i) => sum + this.invoiceNet(i), 0);

    const franchiseMap = new Map(franchises.map(f => [f.id, f.name]));
    const branchRevMap = new Map<string, number>();
    invoices.filter(i => i.status !== 'Cancelled').forEach(i => {
      const bName = franchiseMap.get(i.franchiseId || '') || 'Main Branch';
      branchRevMap.set(bName, (branchRevMap.get(bName) || 0) + this.invoiceNet(i));
    });
    const branchRevenue = Array.from(branchRevMap.entries()).map(([branch, amount]) => ({ branch, amount }));

    return {
      businessSummary: {
        totalFranchises: franchises.length,
        activeFranchises: franchises.length,
        totalEmployees: employees.length,
        totalCustomers: customers.length,
        vehiclesServiced: jobs.filter(j => COMPLETED_JOB_STATUSES.includes(j.status)).length,
        activeJobCards: jobs.filter(j => !COMPLETED_JOB_STATUSES.includes(j.status)).length,
      },
      revenueSummary: {
        todayRevenue,
        monthlyRevenue,
        branchRevenue,
        outstandingPayments,
      },
      leadSummary: {
        newLeads: leads.filter(l => l.status === 'New' || l.status === 'NEW').length,
        convertedLeads: leads.filter(l => ['Converted', 'Won', 'Closed'].includes(l.status)).length,
        pendingFollowups: leads.filter(l => ['Follow-Up', 'Contacted', 'In Progress'].includes(l.status)).length,
        lostLeads: leads.filter(l => l.status === 'Lost' || l.status === 'LOST').length,
      },
      workshopSummary: {
        vehiclesInProgress: jobs.filter(j => j.status === 'In Progress').length,
        qcPending: jobs.filter(j => j.status === 'QC Pending').length,
        billingPending: jobs.filter(j => j.status === 'Completed').length,
        readyForDelivery: jobs.filter(j => j.status === 'Completed').length,
        delayedVehicles: jobs.filter(j => j.estCompletion && new Date(j.estCompletion) < new Date() && !COMPLETED_JOB_STATUSES.includes(j.status)).length,
      },
      inventorySummary: {
        lowStock: inventory.filter(i => i.stock <= (i.reorder || 5)).length,
        pendingStockRequests: 0,
        pendingDispatches: 0,
        inventoryValuation: inventory.reduce((sum, i) => sum + (i.stock * i.cost), 0),
      },
    };
  }

  // ─── CRM Reports (PRD §16.6) ─────────────────────────────────────────────────

  async getLeadRegisterReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getLeadsInRange(franchiseId, parseDate(from), parseDate(to));
    return rows.map(l => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      source: l.source || 'Walk-in',
      status: l.status,
      assignedTo: l.assignedTo || 'Unassigned',
      date: l.date?.toISOString().split('T')[0] || '',
      notes: l.notes || '',
    }));
  }

  async getLeadSourceAnalysisReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getLeadsInRange(franchiseId, parseDate(from), parseDate(to));
    const sourceMap = new Map<string, { count: number; converted: number }>();
    rows.forEach(l => {
      const s = l.source || 'Other';
      const entry = sourceMap.get(s) || { count: 0, converted: 0 };
      entry.count += 1;
      if (['Converted', 'Won', 'Closed'].includes(l.status)) entry.converted += 1;
      sourceMap.set(s, entry);
    });
    return Array.from(sourceMap.entries()).map(([source, data]) => ({
      source,
      count: data.count,
      converted: data.converted,
      conversionRate: data.count > 0 ? Math.round((data.converted / data.count) * 100) : 0,
    }));
  }

  async getLeadConversionReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getLeadsInRange(franchiseId, parseDate(from), parseDate(to));
    const total = rows.length;
    const converted = rows.filter(l => ['Converted', 'Won', 'Closed'].includes(l.status)).length;
    const lost = rows.filter(l => l.status === 'Lost' || l.status === 'LOST').length;
    const pending = total - converted - lost;
    return [{
      totalLeads: total,
      convertedLeads: converted,
      lostLeads: lost,
      pendingLeads: pending,
      conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
    }];
  }

  async getLostLeadReport(franchiseId?: string, from?: string, to?: string) {
    const rows = await this.repository.getLeadsInRange(franchiseId, parseDate(from), parseDate(to));
    return rows.filter(l => l.status === 'Lost' || l.status === 'LOST').map(l => ({
      id: l.id,
      name: l.name,
      phone: l.phone,
      source: l.source || 'Other',
      date: l.date?.toISOString().split('T')[0] || '',
      reason: l.lostReason || l.notes || 'No reason specified',
    }));
  }

  async getFollowUpPerformanceReport(franchiseId?: string, from?: string, to?: string) {
    const followUps = await this.repository.getLeadFollowUpsInRange(franchiseId, parseDate(from), parseDate(to));
    const empMap = new Map<string, { employeeName: string; totalFollowups: number; modes: Record<string, number>; outcomes: Record<string, number> }>();
    followUps.forEach(f => {
      const name = f.performedBy || 'System';
      const entry = empMap.get(name) || { employeeName: name, totalFollowups: 0, modes: {}, outcomes: {} };
      entry.totalFollowups += 1;
      entry.modes[f.mode] = (entry.modes[f.mode] || 0) + 1;
      if (f.outcome) {
        entry.outcomes[f.outcome] = (entry.outcomes[f.outcome] || 0) + 1;
      }
      empMap.set(name, entry);
    });
    return Array.from(empMap.values()).map(e => ({
      employeeName: e.employeeName,
      totalFollowups: e.totalFollowups,
      phoneCall: e.modes['Phone Call'] || 0,
      whatsApp: e.modes['WhatsApp'] || 0,
      email: e.modes['Email'] || 0,
      interested: e.outcomes['Interested'] || 0,
      dealClosed: e.outcomes['Deal Closed'] || 0,
      noResponse: e.outcomes['No Response'] || 0,
    }));
  }

  async exportCrmCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];
    const columnSets: Record<string, { key: string; label: string }[]> = {
      register: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Lead Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'source', label: 'Source' },
        { key: 'status', label: 'Status' },
        { key: 'assignedTo', label: 'Assigned To' },
        { key: 'date', label: 'Date' },
      ],
      sources: [
        { key: 'source', label: 'Source' },
        { key: 'count', label: 'Total Leads' },
        { key: 'converted', label: 'Converted' },
        { key: 'conversionRate', label: 'Conversion Rate (%)' },
      ],
      conversion: [
        { key: 'totalLeads', label: 'Total Leads' },
        { key: 'convertedLeads', label: 'Converted Leads' },
        { key: 'lostLeads', label: 'Lost Leads' },
        { key: 'pendingLeads', label: 'Pending Leads' },
        { key: 'conversionRate', label: 'Conversion Rate (%)' },
      ],
      lost: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Lead Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'source', label: 'Source' },
        { key: 'date', label: 'Date' },
        { key: 'reason', label: 'Reason' },
      ],
      'followup-performance': [
        { key: 'employeeName', label: 'Employee Name' },
        { key: 'totalFollowups', label: 'Total Follow-ups' },
        { key: 'phoneCall', label: 'Phone Call Count' },
        { key: 'whatsApp', label: 'WhatsApp Count' },
        { key: 'email', label: 'Email Count' },
        { key: 'interested', label: 'Interested Count' },
        { key: 'dealClosed', label: 'Deal Closed Count' },
        { key: 'noResponse', label: 'No Response Count' },
      ],
    };

    switch (type) {
      case 'register':   rows = await this.getLeadRegisterReport(franchiseId, from, to); break;
      case 'sources':    rows = await this.getLeadSourceAnalysisReport(franchiseId, from, to); break;
      case 'conversion': rows = await this.getLeadConversionReport(franchiseId, from, to); break;
      case 'lost':       rows = await this.getLostLeadReport(franchiseId, from, to); break;
      case 'followup-performance': rows = await this.getFollowUpPerformanceReport(franchiseId, from, to); break;
      default: throw new Error(`Unknown CRM report type: ${type}`);
    }

    const columns = columnSets[type] || columnSets['register']!;
    const csv = toCsv(rows, columns);
    return { csv, filename: `crm_${type}_${today}.csv` };
  }

  // ─── Customer Reports (PRD §16.7) ────────────────────────────────────────────

  async getCustomerRegisterReport(franchiseId?: string) {
    const customers = await this.repository.getCustomers(franchiseId);
    return customers.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email || '',
      city: c.city || '',
      joinedDate: c.lastVisit?.toISOString().split('T')[0] || '',
      vehiclesCount: 1,
    }));
  }

  async getCustomerVisitReport(franchiseId?: string, from?: string, to?: string) {
    const jobs = await this.repository.getWorkshopJobs(franchiseId, parseDate(from), parseDate(to));
    const visitMap = new Map<string, { customer: string; phone: string; visits: number; lastVisit: string }>();
    jobs.forEach(j => {
      const key = (j.customer || 'Unknown').trim();
      const entry = visitMap.get(key) || { customer: key, phone: '', visits: 0, lastVisit: '' };
      entry.visits += 1;
      const jDate = j.startDate?.toISOString().split('T')[0] || '';
      if (jDate > entry.lastVisit) entry.lastVisit = jDate;
      visitMap.set(key, entry);
    });
    return Array.from(visitMap.values()).sort((a, b) => b.visits - a.visits);
  }

  async getCustomerRevenueReport(franchiseId?: string, from?: string, to?: string) {
    return this.getCustomerWiseRevenueReport(franchiseId, from, to);
  }

  async getCustomerServiceHistoryReport(franchiseId?: string, from?: string, to?: string) {
    const jobs = await this.repository.getWorkshopJobs(franchiseId, parseDate(from), parseDate(to));
    return jobs.map(j => ({
      jobId: j.id,
      date: j.startDate?.toISOString().split('T')[0] ?? '',
      customer: j.customer,
      vehicle: j.vehicle,
      service: j.service,
      status: j.status,
      technician: j.technician || 'Unassigned',
    }));
  }

  async exportCustomerCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];
    const columnSets: Record<string, { key: string; label: string }[]> = {
      register: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Customer Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'city', label: 'City' },
        { key: 'joinedDate', label: 'Joined Date' },
      ],
      visits: [
        { key: 'customer', label: 'Customer Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'visits', label: 'Total Visits' },
        { key: 'lastVisit', label: 'Last Visit Date' },
      ],
      revenue: [
        { key: 'customer', label: 'Customer Name' },
        { key: 'invoiceCount', label: 'Invoices' },
        { key: 'total', label: 'Total Revenue (₹)' },
      ],
      history: [
        { key: 'jobId', label: 'Job Card ID' },
        { key: 'date', label: 'Service Date' },
        { key: 'customer', label: 'Customer Name' },
        { key: 'vehicle', label: 'Vehicle' },
        { key: 'service', label: 'Service' },
        { key: 'status', label: 'Status' },
      ],
    };

    switch (type) {
      case 'register': rows = await this.getCustomerRegisterReport(franchiseId); break;
      case 'visits':   rows = await this.getCustomerVisitReport(franchiseId, from, to); break;
      case 'revenue':  rows = await this.getCustomerRevenueReport(franchiseId, from, to); break;
      case 'history':  rows = await this.getCustomerServiceHistoryReport(franchiseId, from, to); break;
      default: throw new Error(`Unknown Customer report type: ${type}`);
    }

    const columns = columnSets[type] || columnSets['register']!;
    const csv = toCsv(rows, columns);
    return { csv, filename: `customer_${type}_${today}.csv` };
  }

  // ─── Employee Reports (PRD §16.8) ────────────────────────────────────────────

  async getAttendanceReport(franchiseId?: string) {
    const employees = await this.repository.getEmployees(franchiseId);
    return employees.map(e => ({
      id: e.id,
      name: e.name,
      role: e.role,
      status: e.status || 'Active',
      attendanceToday: 'Present',
      daysWorkedThisMonth: 22,
    }));
  }

  async getTechnicianProductivityReport(franchiseId?: string, from?: string, to?: string) {
    return this.getEmployeeWorkloadReport(franchiseId);
  }

  async getRevenueContributionReport(franchiseId?: string, from?: string, to?: string) {
    const [jobs, invoices] = await Promise.all([
      this.repository.getWorkshopJobs(franchiseId, parseDate(from), parseDate(to)),
      this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to)),
    ]);
    const jobInvoiceMap = new Map(invoices.map(i => [i.jobId || '', this.invoiceNet(i)]));
    const techMap = new Map<string, { technician: string; jobsCount: number; revenueGenerated: number }>();
    jobs.forEach(j => {
      const tech = j.technician || 'Unassigned';
      const entry = techMap.get(tech) || { technician: tech, jobsCount: 0, revenueGenerated: 0 };
      entry.jobsCount += 1;
      entry.revenueGenerated += jobInvoiceMap.get(j.id) || 0;
      techMap.set(tech, entry);
    });
    return Array.from(techMap.values()).sort((a, b) => b.revenueGenerated - a.revenueGenerated);
  }

  async exportEmployeeCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];
    const columnSets: Record<string, { key: string; label: string }[]> = {
      attendance: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Employee Name' },
        { key: 'role', label: 'Role' },
        { key: 'status', label: 'Status' },
        { key: 'attendanceToday', label: 'Today' },
      ],
      productivity: [
        { key: 'technician', label: 'Technician Name' },
        { key: 'totalJobs', label: 'Total Jobs' },
        { key: 'completed', label: 'Completed Jobs' },
        { key: 'inProgress', label: 'In Progress' },
      ],
      contribution: [
        { key: 'technician', label: 'Technician Name' },
        { key: 'jobsCount', label: 'Jobs Serviced' },
        { key: 'revenueGenerated', label: 'Revenue Contribution (₹)' },
      ],
    };

    switch (type) {
      case 'attendance':   rows = await this.getAttendanceReport(franchiseId); break;
      case 'productivity': rows = await this.getTechnicianProductivityReport(franchiseId, from, to); break;
      case 'contribution': rows = await this.getRevenueContributionReport(franchiseId, from, to); break;
      default: throw new Error(`Unknown Employee report type: ${type}`);
    }

    const columns = columnSets[type] || columnSets['attendance']!;
    const csv = toCsv(rows, columns);
    return { csv, filename: `employee_${type}_${today}.csv` };
  }

  // ─── Financial Reports (PRD §16.9) ───────────────────────────────────────────

  async getPaymentRegisterReport(franchiseId?: string, from?: string, to?: string) {
    const payments = await this.repository.getPaymentsInRange(franchiseId, parseDate(from), parseDate(to));
    return payments.map(p => ({
      receiptNo: p.receiptNumber || p.id,
      invoiceRef: p.invoiceId || 'N/A',
      client: p.client,
      amount: p.amount,
      mode: p.mode,
      type: p.type || 'Full Payment',
      date: p.date.toISOString().split('T')[0],
    }));
  }

  async getOutstandingReport(franchiseId?: string, from?: string, to?: string) {
    const invoices = await this.repository.getInvoicesInRange(franchiseId, parseDate(from), parseDate(to));
    return invoices
      .filter(i => i.status !== 'Paid' && i.status !== 'Cancelled')
      .map(i => {
        const net = this.invoiceNet(i);
        const paid = i.status === 'Paid' ? net : 0;
        return {
          invoiceNo: i.id,
          date: i.date?.toISOString().split('T')[0] ?? '',
          customer: i.client,
          phone: i.phone,
          totalAmount: net,
          amountPaid: paid,
          outstandingAmount: net - paid,
          status: i.status,
        };
      });
  }

  async getCollectionReport(franchiseId?: string, from?: string, to?: string) {
    const payments = await this.repository.getPaymentsInRange(franchiseId, parseDate(from), parseDate(to));
    const modeMap = new Map<string, { count: number; total: number }>();
    payments.forEach(p => {
      const mode = p.mode || 'Cash';
      const entry = modeMap.get(mode) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += p.amount;
      modeMap.set(mode, entry);
    });
    return Array.from(modeMap.entries()).map(([mode, data]) => ({
      mode,
      transactions: data.count,
      totalCollected: data.total,
    }));
  }

  async getPaymentModeSummaryReport(franchiseId?: string, from?: string, to?: string) {
    return this.getCollectionReport(franchiseId, from, to);
  }

  async exportFinancialCsv(type: string, franchiseId?: string, from?: string, to?: string): Promise<{ csv: string; filename: string }> {
    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];
    const columnSets: Record<string, { key: string; label: string }[]> = {
      'payment-register': [
        { key: 'receiptNo', label: 'Receipt No' },
        { key: 'invoiceRef', label: 'Invoice Ref' },
        { key: 'client', label: 'Client' },
        { key: 'amount', label: 'Amount (₹)' },
        { key: 'mode', label: 'Payment Mode' },
        { key: 'type', label: 'Type' },
        { key: 'date', label: 'Date' },
      ],
      outstanding: [
        { key: 'invoiceNo', label: 'Invoice No' },
        { key: 'date', label: 'Date' },
        { key: 'customer', label: 'Customer' },
        { key: 'phone', label: 'Phone' },
        { key: 'totalAmount', label: 'Total Amount (₹)' },
        { key: 'amountPaid', label: 'Paid (₹)' },
        { key: 'outstandingAmount', label: 'Outstanding (₹)' },
        { key: 'status', label: 'Status' },
      ],
      collection: [
        { key: 'mode', label: 'Payment Mode' },
        { key: 'transactions', label: 'Transaction Count' },
        { key: 'totalCollected', label: 'Total Collected (₹)' },
      ],
    };

    switch (type) {
      case 'payment-register': rows = await this.getPaymentRegisterReport(franchiseId, from, to); break;
      case 'outstanding':      rows = await this.getOutstandingReport(franchiseId, from, to); break;
      case 'collection':       rows = await this.getCollectionReport(franchiseId, from, to); break;
      case 'payment-modes':    rows = await this.getPaymentModeSummaryReport(franchiseId, from, to); break;
      default: throw new Error(`Unknown Financial report type: ${type}`);
    }

    const columns = columnSets[type] || columnSets['payment-register']!;
    const csv = toCsv(rows, columns);
    return { csv, filename: `financial_${type}_${today}.csv` };
  }

  // ─── Inventory Reports (PRD §16.10) ──────────────────────────────────────────

  async getProductRegisterReport(franchiseId?: string) {
    const items = await this.repository.getInventory(franchiseId);
    return items.map(i => ({
      sku: i.id,
      name: i.name,
      category: i.category || 'General',
      stock: i.stock,
      unit: i.unit || 'pcs',
      minStock: i.reorder || 5,
      cost: i.cost,
      price: Math.round(i.cost * 1.35),
    }));
  }

  async getStockSummaryReport(franchiseId?: string) {
    const items = await this.repository.getInventory(franchiseId);
    const catMap = new Map<string, { category: string; totalItems: number; totalStock: number; totalValue: number }>();
    items.forEach(i => {
      const cat = i.category || 'General';
      const entry = catMap.get(cat) || { category: cat, totalItems: 0, totalStock: 0, totalValue: 0 };
      entry.totalItems += 1;
      entry.totalStock += i.stock;
      entry.totalValue += i.stock * i.cost;
      catMap.set(cat, entry);
    });
    return Array.from(catMap.values()).sort((a, b) => b.totalValue - a.totalValue);
  }

  async getLowStockReport(franchiseId?: string) {
    const items = await this.repository.getInventory(franchiseId);
    return items
      .filter(i => i.stock <= (i.reorder || 5))
      .map(i => ({
        sku: i.id,
        name: i.name,
        category: i.category || 'General',
        currentStock: i.stock,
        minStock: i.reorder || 5,
        status: i.stock === 0 ? 'Out of Stock' : 'Low Stock',
      }));
  }

  async getInventoryValuationReport(franchiseId?: string) {
    const items = await this.repository.getInventory(franchiseId);
    return items.map(i => ({
      sku: i.id,
      name: i.name,
      category: i.category || 'General',
      stock: i.stock,
      cost: i.cost,
      price: Math.round(i.cost * 1.35),
      totalCostValue: i.stock * i.cost,
      totalRetailValue: i.stock * Math.round(i.cost * 1.35),
    }));
  }

  async getStockLedgerReport(franchiseId?: string) {
    const [movements, inventory] = await Promise.all([
      this.repository.getInventoryMovements(franchiseId),
      this.repository.getInventory(franchiseId),
    ]);
    const itemMap = new Map(inventory.map(i => [i.id, i.name]));
    return movements.map(m => ({
      date: m.performedAt.toISOString().split('T')[0] ?? '',
      time: m.performedAt.toISOString().split('T')[1]?.slice(0, 5) ?? '',
      sku: m.itemId,
      name: itemMap.get(m.itemId) || 'Unknown Item',
      type: m.type,
      qty: m.quantity,
      balance: m.balance,
      reference: m.reference,
      performedBy: m.performedBy,
    }));
  }

  async exportInventoryCsv(type: string, franchiseId?: string): Promise<{ csv: string; filename: string }> {
    let rows: any[] = [];
    const today = new Date().toISOString().split('T')[0];
    const columnSets: Record<string, { key: string; label: string }[]> = {
      register: [
        { key: 'sku', label: 'SKU / Code' },
        { key: 'name', label: 'Product Name' },
        { key: 'category', label: 'Category' },
        { key: 'stock', label: 'Stock' },
        { key: 'unit', label: 'Unit' },
        { key: 'cost', label: 'Cost Price (₹)' },
        { key: 'price', label: 'Selling Price (₹)' },
      ],
      summary: [
        { key: 'category', label: 'Category' },
        { key: 'totalItems', label: 'Unique Items' },
        { key: 'totalStock', label: 'Total Units' },
        { key: 'totalValue', label: 'Stock Value (₹)' },
      ],
      'low-stock': [
        { key: 'sku', label: 'SKU / Code' },
        { key: 'name', label: 'Product Name' },
        { key: 'category', label: 'Category' },
        { key: 'currentStock', label: 'Current Stock' },
        { key: 'minStock', label: 'Min Alert Stock' },
        { key: 'status', label: 'Status' },
      ],
      valuation: [
        { key: 'sku', label: 'SKU / Code' },
        { key: 'name', label: 'Product Name' },
        { key: 'stock', label: 'Stock Units' },
        { key: 'cost', label: 'Cost Price (₹)' },
        { key: 'totalCostValue', label: 'Total Cost Value (₹)' },
        { key: 'totalRetailValue', label: 'Total Retail Value (₹)' },
      ],
      ledger: [
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'sku', label: 'SKU / Code' },
        { key: 'name', label: 'Product Name' },
        { key: 'type', label: 'Transaction Type' },
        { key: 'qty', label: 'Quantity' },
        { key: 'balance', label: 'Balance Stock' },
        { key: 'reference', label: 'Reference' },
        { key: 'performedBy', label: 'Performed By' },
      ],
    };

    switch (type) {
      case 'register':  rows = await this.getProductRegisterReport(franchiseId); break;
      case 'summary':   rows = await this.getStockSummaryReport(franchiseId); break;
      case 'low-stock': rows = await this.getLowStockReport(franchiseId); break;
      case 'valuation': rows = await this.getInventoryValuationReport(franchiseId); break;
      case 'ledger':    rows = await this.getStockLedgerReport(franchiseId); break;
      default: throw new Error(`Unknown Inventory report type: ${type}`);
    }

    const columns = columnSets[type] || columnSets['register']!;
    const csv = toCsv(rows, columns);
    return { csv, filename: `inventory_${type}_${today}.csv` };
  }
}
