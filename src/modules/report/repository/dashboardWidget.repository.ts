import { db } from '../../../lib/db.js';

// REP-01C (D-REP5) — plain CRUD against the new additive
// DashboardWidgetConfig table (prisma/schema.prisma). No business logic
// here; default-merging and validation live in the service layer.
export class DashboardWidgetRepository {
  async findByDashboardType(dashboardType: string) {
    return db.dashboardWidgetConfig.findMany({ where: { dashboardType }, orderBy: { order: 'asc' } });
  }

  async upsertMany(
    dashboardType: string,
    widgets: { widgetKey: string; visible: boolean; order: number }[],
    updatedBy?: string
  ) {
    return Promise.all(
      widgets.map(w =>
        db.dashboardWidgetConfig.upsert({
          where: { dashboardType_widgetKey: { dashboardType, widgetKey: w.widgetKey } },
          create: { dashboardType, widgetKey: w.widgetKey, visible: w.visible, order: w.order, updatedBy },
          update: { visible: w.visible, order: w.order, updatedBy },
        })
      )
    );
  }
}
