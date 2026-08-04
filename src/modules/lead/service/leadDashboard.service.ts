import { db } from '../../../lib/db.js';

export class LeadDashboardService {
  async getDashboardData(franchiseId: string | null, isHQ: boolean) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Tenant filter
    const tenantFilter = {
      isDeleted: false,
      ...(isHQ ? {} : franchiseId ? { franchiseId } : {}),
    };

    // 1. Fetch all leads under this scope
    const leads = await db.lead.findMany({
      where: tenantFilter,
    });

    // 2. Count statuses
    const newLeadsCount = leads.filter(l => l.status.toLowerCase() === 'new').length;
    const convertedLeadsCount = leads.filter(l => l.status.toLowerCase() === 'converted').length;
    const lostLeadsCount = leads.filter(l => l.status.toLowerCase() === 'lost').length;

    // 3. Today's Follow-ups & Overdue Follow-ups
    // Query follow-ups matching date
    const followUpsToday = await db.leadFollowUp.count({
      where: {
        nextFollowUpDate: {
          gte: todayStart,
          lte: todayEnd,
        },
        ...(isHQ ? {} : franchiseId ? { franchiseId } : {}),
      },
    });

    const callbacksToday = await db.callback.count({
      where: {
        status: { in: ['Pending', 'Rescheduled'] },
        scheduledAt: {
          gte: todayStart,
          lte: todayEnd,
        },
        ...(isHQ ? {} : franchiseId ? { franchiseId } : {}),
      },
    });

    const totalTodayFollowUps = followUpsToday + callbacksToday;

    // Overdue Follow-ups (nextFollowUpDate in the past, or callback overdue)
    const overdueFollowUps = await db.leadFollowUp.count({
      where: {
        nextFollowUpDate: {
          lt: todayStart,
        },
        lead: {
          status: { notIn: ['Converted', 'Closed', 'Lost'] },
        },
        ...(isHQ ? {} : franchiseId ? { franchiseId } : {}),
      },
    });

    const overdueCallbacks = await db.callback.count({
      where: {
        status: { in: ['Pending', 'Overdue'] },
        scheduledAt: {
          lt: todayStart,
        },
        ...(isHQ ? {} : franchiseId ? { franchiseId } : {}),
      },
    });

    const totalOverdueFollowUps = overdueFollowUps + overdueCallbacks;

    // 4. Lead Source Analysis
    const sourceMap: Record<string, number> = {};
    leads.forEach(l => {
      const src = l.source || 'Unknown';
      sourceMap[src] = (sourceMap[src] || 0) + 1;
    });
    const leadSourceAnalysis = Object.entries(sourceMap).map(([source, count]) => ({
      source,
      count,
      percentage: leads.length > 0 ? Math.round((count / leads.length) * 100) : 0,
    }));

    // 5. Employee-wise Lead Performance
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

    const employeePerformance = Object.entries(empMap).map(([employeeId, data]) => ({
      employeeId,
      employeeName: data.name,
      totalLeads: data.total,
      converted: data.converted,
      lost: data.lost,
      conversionRate: data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
    }));

    // 6. Franchise-wise Lead Performance
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

    // Fetch franchise names
    const franchises = await db.franchise.findMany({ where: { isDeleted: false } });
    const franchiseNameMap = new Map(franchises.map(f => [f.id, f.name]));

    const franchisePerformance = Object.entries(franchiseMap).map(([franchiseId, data]) => ({
      franchiseId,
      franchiseName: franchiseNameMap.get(franchiseId) || 'Headquarters',
      totalLeads: data.total,
      converted: data.converted,
      lost: data.lost,
      conversionRate: data.total > 0 ? Math.round((data.converted / data.total) * 100) : 0,
    }));

    return {
      newLeads: newLeadsCount,
      todayFollowUps: totalTodayFollowUps,
      overdueFollowUps: totalOverdueFollowUps,
      convertedLeads: convertedLeadsCount,
      lostLeads: lostLeadsCount,
      leadSourceAnalysis,
      employeePerformance,
      franchisePerformance,
    };
  }
}
