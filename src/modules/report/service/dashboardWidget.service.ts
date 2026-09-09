import { DashboardWidgetRepository } from '../repository/dashboardWidget.repository.js';

// REP-01C (D-REP5) — minimum viable dashboard widget configuration:
// HQ-controlled visibility + display order only for the two canonical
// dashboards this phase actually built dedicated routes for (the
// Executive/HQ Summary and the §16.4 Franchise Dashboard, both gated by
// dashboards:executive:view). No layout engine, no per-widget sizing/
// positioning, no per-franchise customization — all explicitly out of
// scope per D-REP5. Extending this to the remaining D-21 dashboard
// classes (reception/workshop/qc/billing/inventory) is future work once
// each gets its own dedicated route the way executive/franchise now do —
// today those are still just sections of the single legacy
// GET /api/dashboard (endpoint C), which has no per-section route to
// attach a widget config to.
export const KNOWN_DASHBOARD_WIDGETS: Record<string, string[]> = {
  executive: ['businessSummary', 'revenueSummary', 'leadSummary', 'workshopSummary', 'inventorySummary'],
  franchise: [
    'todaysAppointments', 'vehiclesReceived', 'activeJobs', 'vehiclesReadyForDelivery',
    'revenueToday', 'outstandingPayments', 'todaysAttendance', 'employeePerformance', 'lowStockProducts',
  ],
};

export class DashboardWidgetService {
  constructor(private readonly repository: DashboardWidgetRepository = new DashboardWidgetRepository()) {}

  private knownKeys(dashboardType: string): string[] {
    const keys = KNOWN_DASHBOARD_WIDGETS[dashboardType];
    if (!keys) throw new Error(`Unknown dashboardType: ${dashboardType}. Valid types: ${Object.keys(KNOWN_DASHBOARD_WIDGETS).join(', ')}`);
    return keys;
  }

  // A widgetKey with no stored row is "visible, default order" (its
  // position in the known-keys list) — the table never needs seeding.
  async getConfig(dashboardType: string) {
    const knownKeys = this.knownKeys(dashboardType);
    const stored = await this.repository.findByDashboardType(dashboardType);
    const storedMap = new Map(stored.map(s => [s.widgetKey, s]));

    return knownKeys
      .map((key, index) => {
        const row = storedMap.get(key);
        return {
          widgetKey: key,
          visible: row ? row.visible : true,
          order: row ? row.order : index,
        };
      })
      .sort((a, b) => a.order - b.order);
  }

  async updateConfig(
    dashboardType: string,
    widgets: { widgetKey: string; visible: boolean; order: number }[],
    updatedBy?: string
  ) {
    const knownKeys = new Set(this.knownKeys(dashboardType));
    const invalid = widgets.filter(w => !knownKeys.has(w.widgetKey));
    if (invalid.length > 0) {
      throw new Error(`Unknown widgetKey(s) for dashboardType "${dashboardType}": ${invalid.map(w => w.widgetKey).join(', ')}`);
    }
    await this.repository.upsertMany(dashboardType, widgets, updatedBy);
    return this.getConfig(dashboardType);
  }
}
