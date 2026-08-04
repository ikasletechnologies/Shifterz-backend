import { db } from '../../../lib/db.js';

export class LeadReportService {
  /**
   * Helper to convert an array of objects to a CSV string.
   */
  toCSV(data: any[]): string {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','), // Header row
      ...data.map(row =>
        headers
          .map(fieldName => {
            const val = row[fieldName];
            // Format cell value: escape double quotes, wrap in quotes if contains comma/newline
            const stringified = val === null || val === undefined ? '' : String(val);
            const escaped = stringified.replace(/"/g, '""');
            if (escaped.includes(',') || escaped.includes('\n') || escaped.includes('"')) {
              return `"${escaped}"`;
            }
            return escaped;
          })
          .join(',')
      ),
    ];
    return csvRows.join('\r\n');
  }

  // 1. Lead Register
  async getLeadRegister(franchiseId: string | null, isHQ: boolean) {
    const leads = await db.lead.findMany({
      where: {
        isDeleted: false,
        ...(isHQ ? {} : franchiseId ? { franchiseId } : {}),
      },
      orderBy: { date: 'desc' },
    });

    return leads.map(l => ({
      'Lead ID': l.id,
      'Customer Name': l.name,
      'Phone': l.phone,
      'Alternate Phone': l.alternateNumber || '',
      'Email': l.email,
      'City': l.city || '',
      'Source': l.source,
      'Service': l.service,
      'Vehicle': l.vehicle,
      'Vehicle Make': l.vehicleMake || '',
      'Vehicle Model': l.vehicleModel || '',
      'Assigned Employee': l.assignedTo,
      'Status': l.status,
      'Priority': l.priority || 'Medium',
      'Created Date': l.date.toISOString().slice(0, 10),
    }));
  }

  // 2. Follow-up Report
  async getFollowUpReport(franchiseId: string | null, isHQ: boolean) {
    const followUps = await db.leadFollowUp.findMany({
      where: {
        ...(isHQ ? {} : franchiseId ? { franchiseId } : {}),
      },
      include: { lead: true },
      orderBy: { followUpDate: 'desc' },
    });

    return followUps.map(f => ({
      'Follow-Up ID': f.id,
      'Lead ID': f.leadId,
      'Lead Name': f.lead.name,
      'Date & Time': f.followUpDate.toISOString(),
      'Performed By': f.performedBy,
      'Mode': f.mode,
      'Discussion Notes': f.notes,
      'Outcome': f.outcome || '',
      'Next Action': f.nextAction || '',
      'Next Follow-Up Date': f.nextFollowUpDate ? f.nextFollowUpDate.toISOString() : '',
      'Lead Status Update': f.leadStatusUpdate || '',
    }));
  }

  // 3. Callback Report
  async getCallbackReport(franchiseId: string | null, isHQ: boolean) {
    const callbacks = await db.callback.findMany({
      where: {
        isDeleted: false,
        ...(isHQ ? {} : franchiseId ? { franchiseId } : {}),
      },
      orderBy: { scheduledAt: 'desc' },
    });

    return callbacks.map(c => ({
      'Callback ID': c.id,
      'Customer/Lead Name': c.leadName || c.customerName || 'Unknown',
      'Scheduled At': c.scheduledAt.toISOString(),
      'Assigned To': c.assignedTo,
      'Status': c.status,
      'Reminder Notes': c.reminderNotes,
      'Completed At': c.completedAt ? c.completedAt.toISOString() : '',
      'Completed By': c.completedBy || '',
      'Completed Notes': c.completedNotes || '',
      'Rescheduled To': c.rescheduledTo ? c.rescheduledTo.toISOString() : '',
    }));
  }

  // 4. Lead Conversion Report
  async getLeadConversionReport(franchiseId: string | null, isHQ: boolean) {
    const leads = await db.lead.findMany({
      where: {
        isDeleted: false,
        status: 'Converted',
        ...(isHQ ? {} : franchiseId ? { franchiseId } : {}),
      },
      orderBy: { convertedAt: 'desc' },
    });

    return leads.map(l => ({
      'Lead ID': l.id,
      'Name': l.name,
      'Phone': l.phone,
      'Email': l.email,
      'Source': l.source,
      'Service': l.service,
      'Customer ID': l.customerId || '',
      'Created Date': l.date.toISOString().slice(0, 10),
      'Converted At': l.convertedAt ? l.convertedAt.toISOString() : '',
    }));
  }

  // 5. Lost Lead Analysis
  async getLostLeadAnalysis(franchiseId: string | null, isHQ: boolean) {
    const leads = await db.lead.findMany({
      where: {
        isDeleted: false,
        status: 'Lost',
        ...(isHQ ? {} : franchiseId ? { franchiseId } : {}),
      },
      orderBy: { date: 'desc' },
    });

    return leads.map(l => ({
      'Lead ID': l.id,
      'Name': l.name,
      'Phone': l.phone,
      'Source': l.source,
      'Service': l.service,
      'Lost Reason': l.lostReason || 'Not Specified',
      'Created Date': l.date.toISOString().slice(0, 10),
      'Notes': l.notes,
    }));
  }

  // 6. Lead Source Report
  async getLeadSourceReport(franchiseId: string | null, isHQ: boolean) {
    const leads = await db.lead.findMany({
      where: {
        isDeleted: false,
        ...(isHQ ? {} : franchiseId ? { franchiseId } : {}),
      },
    });

    const sourceMap: Record<string, { total: number; converted: number; lost: number }> = {};
    leads.forEach(l => {
      const src = l.source || 'Other';
      if (!sourceMap[src]) sourceMap[src] = { total: 0, converted: 0, lost: 0 };
      sourceMap[src].total += 1;
      if (l.status.toLowerCase() === 'converted') sourceMap[src].converted += 1;
      if (l.status.toLowerCase() === 'lost') sourceMap[src].lost += 1;
    });

    return Object.entries(sourceMap).map(([source, data]) => ({
      'Lead Source': source,
      'Total Leads': data.total,
      'Converted': data.converted,
      'Lost': data.lost,
      'Conversion Rate %': data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
    }));
  }

  // 7. Employee Performance Report
  async getEmployeePerformanceReport(franchiseId: string | null, isHQ: boolean) {
    const leads = await db.lead.findMany({
      where: {
        isDeleted: false,
        ...(isHQ ? {} : franchiseId ? { franchiseId } : {}),
      },
    });

    const empMap: Record<string, { total: number; converted: number; lost: number; name: string }> = {};
    leads.forEach(l => {
      const empId = l.assignedToId || 'unassigned';
      if (!empMap[empId]) {
        empMap[empId] = { total: 0, converted: 0, lost: 0, name: l.assignedTo || 'Unassigned' };
      }
      empMap[empId].total += 1;
      if (l.status.toLowerCase() === 'converted') empMap[empId].converted += 1;
      if (l.status.toLowerCase() === 'lost') empMap[empId].lost += 1;
    });

    return Object.entries(empMap).map(([employeeId, data]) => ({
      'Employee ID': employeeId,
      'Employee Name': data.name,
      'Total Leads Assigned': data.total,
      'Converted': data.converted,
      'Lost': data.lost,
      'Conversion Rate %': data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
    }));
  }

  // 8. Franchise Lead Report
  async getFranchiseLeadReport(franchiseId: string | null, isHQ: boolean) {
    const leads = await db.lead.findMany({
      where: {
        isDeleted: false,
        ...(isHQ ? {} : franchiseId ? { franchiseId } : {}),
      },
    });

    const franchiseMap: Record<string, { total: number; converted: number; lost: number }> = {};
    leads.forEach(l => {
      const fId = l.franchiseId || 'HQ';
      if (!franchiseMap[fId]) {
        franchiseMap[fId] = { total: 0, converted: 0, lost: 0 };
      }
      franchiseMap[fId].total += 1;
      if (l.status.toLowerCase() === 'converted') franchiseMap[fId].converted += 1;
      if (l.status.toLowerCase() === 'lost') franchiseMap[fId].lost += 1;
    });

    const franchises = await db.franchise.findMany({ where: { isDeleted: false } });
    const franchiseNameMap = new Map(franchises.map(f => [f.id, f.name]));

    return Object.entries(franchiseMap).map(([fId, data]) => ({
      'Franchise ID': fId,
      'Franchise Name': franchiseNameMap.get(fId) || 'Headquarters',
      'Total Leads': data.total,
      'Converted': data.converted,
      'Lost': data.lost,
      'Conversion Rate %': data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
    }));
  }
}
