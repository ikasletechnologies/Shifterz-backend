-- REP-01C (D-REP5) — additive only: a brand-new table, no existing
-- table/column/row is altered, renamed, or dropped. Not applied to any
-- live database in this sandbox (no live database connection exists
-- here); written to match this repo's own established precedent of
-- hand-authoring migration SQL alongside an additive schema.prisma
-- change, verified only via `npx prisma validate`.

-- CreateTable
CREATE TABLE "DashboardWidgetConfig" (
    "id" TEXT NOT NULL,
    "dashboardType" TEXT NOT NULL,
    "widgetKey" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardWidgetConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DashboardWidgetConfig_dashboardType_widgetKey_key" ON "DashboardWidgetConfig"("dashboardType", "widgetKey");
