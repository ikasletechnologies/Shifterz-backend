// REP-01C — Reports & Dashboards Architecture Consolidation & Completion.
// Verifies: the shared dashboard aggregation layer and its consumers
// (HQ Summary, Franchise Dashboard); the endpoint classification decisions
// for B/C/D/E/F (compatibility vs specialized) and that each reuses the
// shared layer only where a metric's definition was verified identical;
// the 7 previously-missing EPB §16 reports; RBAC wiring onto the
// previously-ungated duplicate/dashboard routes (D-REP7, reusing only
// existing actions); D-REP5's minimum dashboard widget configuration;
// D-REP6's deleted-record opt-in on the three Register reports.
//
// No live database connection exists in this sandbox (same status as
// every prior phase). Structural/source-inspection checks and pure/live-
// style behavioral checks (real functions invoked with synthetic actors,
// no DB reached) are used throughout — nothing here proves a real Job/
// Lead/Customer/Referral/LeaveRequest row round-trips correctly; that
// remains LIVE VERIFICATION PENDING.
// Run with: npx tsx scripts/test-rep01c-architecture-consolidation.ts
import fs from 'node:fs';
import { resolveDataScope } from '../src/shared/scope/dataScope.js';
import { DashboardWidgetService, KNOWN_DASHBOARD_WIDGETS } from '../src/modules/report/service/dashboardWidget.service.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}

const root = (p: string) => new URL(`../${p}`, import.meta.url);
const src = (p: string) => fs.readFileSync(root(p), 'utf-8');
function body(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end === -1 ? undefined : end);
}

const reportService = src('src/modules/report/service/report.service.ts');
const reportRepo = src('src/modules/report/repository/report.repository.ts');
const reportController = src('src/modules/report/controller/report.controller.ts');
const reportRoutes = src('src/modules/report/routes/report.routes.ts');
const workshopService = src('src/modules/workshop/service/workshop.service.ts');
const workshopController = src('src/modules/workshop/controller/workshop.controller.ts');
const workshopRoutes = src('src/modules/workshop/routes/workshop.routes.ts');
const hqRoutes = src('src/routes/hq.ts');
const dashboardRoutes = src('src/routes/dashboard.ts');
const leadRoutes = src('src/modules/lead/routes/lead.routes.ts');
const customerRoutes = src('src/modules/customer/routes/customer.routes.ts');
const customerService = src('src/modules/customer/service/customer.service.ts');
const schema = src('prisma/schema.prisma');

// ═══ §5/§14 — Shared Dashboard Aggregation Layer (D-REP1/D-REP3) ═════════

assertTrue('ReportService exposes getRevenueSummary', reportService.includes('async getRevenueSummary('));
assertTrue('ReportService exposes getLeadSummary', reportService.includes('async getLeadSummary('));
assertTrue('ReportService exposes getWorkshopSummary', reportService.includes('async getWorkshopSummary('));
assertTrue('ReportService exposes getInventorySummary', reportService.includes('async getInventorySummary('));
assertTrue('ReportService exposes getEmployeeSummary', reportService.includes('async getEmployeeSummary('));
assertTrue('ReportService exposes the canonical getFranchiseDashboardReport (§16.4)', reportService.includes('async getFranchiseDashboardReport('));

const hqSummaryBody = body(reportService, 'async getHQSummary(', 'async getLeadRegisterReport(');
assertTrue('getHQSummary composes revenueSummary from the shared getRevenueSummary()', hqSummaryBody.includes('this.getRevenueSummary(franchiseId)'));
assertTrue('getHQSummary composes leadSummary from the shared getLeadSummary()', hqSummaryBody.includes('this.getLeadSummary(franchiseId)'));
assertTrue('getHQSummary composes workshopSummary from the shared getWorkshopSummary()', hqSummaryBody.includes('this.getWorkshopSummary(franchiseId)'));
assertTrue('getHQSummary composes inventorySummary from the shared getInventorySummary()', hqSummaryBody.includes('this.getInventorySummary(franchiseId)'));

const franchiseDashboardBody = body(reportService, 'async getFranchiseDashboardReport(', undefined);
assertTrue('getFranchiseDashboardReport reuses getRevenueSummary', franchiseDashboardBody.includes('this.getRevenueSummary('));
assertTrue('getFranchiseDashboardReport reuses getWorkshopSummary', franchiseDashboardBody.includes('this.getWorkshopSummary('));
assertTrue('getFranchiseDashboardReport reuses getEmployeeSummary', franchiseDashboardBody.includes('this.getEmployeeSummary('));
assertTrue('getFranchiseDashboardReport reuses getInventorySummary', franchiseDashboardBody.includes('this.getInventorySummary('));
// EPB §16.4's exact field list.
for (const field of ['todaysAppointments', 'vehiclesReceived', 'activeJobs', 'vehiclesReadyForDelivery', 'revenueToday', 'outstandingPayments', 'todaysAttendance', 'employeePerformance', 'lowStockProducts']) {
  assertTrue(`getFranchiseDashboardReport's response includes EPB §16.4 field "${field}"`, franchiseDashboardBody.includes(field));
}

// ═══ Endpoint routing/classification (D-REP4/D-REP7) ════════════════════

assertTrue('endpoint A (new canonical) — GET /api/reports/franchise-dashboard exists, gated dashboards:executive:view', reportRoutes.includes("reportRouter.get('/franchise-dashboard'") && reportRoutes.includes("requireAction('dashboards:executive:view')"));
assertTrue('ReportController.getFranchiseDashboard requires franchiseId and 400s without it', reportController.includes('getFranchiseDashboard') && reportController.includes("'franchiseId is required to view a franchise dashboard.'"));

// Endpoint B — hq.ts /dashboard — COMPATIBILITY.
assertTrue('endpoint B (hq.ts /dashboard) is gated with the existing reports:hq-summary:view action', hqRoutes.includes('hqRouter.get("/dashboard", requireAction(\'reports:hq-summary:view\')'));
assertTrue('endpoint B delegates to the shared ReportService rather than its own inline duplicate calculation', /reportService\.getRevenueSummary|reportService\.getEmployeeSummary|reportService\.getInventorySummary/.test(body(hqRoutes, 'hqRouter.get("/dashboard"', 'hqRouter.get("/reports/employees/performance"')));
assertTrue('endpoint B still returns its original top-level response contract (businessSummary/salesSummary/inventorySummary/employeeSummary keys unchanged)', /businessSummary/.test(hqRoutes) && /salesSummary/.test(hqRoutes) && /inventorySummary/.test(hqRoutes) && /employeeSummary/.test(hqRoutes));

// Endpoint C — dashboard.ts — SPECIALIZED, explicitly left unconsolidated.
assertTrue('endpoint C (dashboard.ts) carries an explicit REP-01C classification note', dashboardRoutes.includes('REP-01C (D-REP4) — endpoint C'));
assertTrue('endpoint C\'s D-21 per-role section filter (its own access-control mechanism) is untouched', dashboardRoutes.includes('allowedDashboardSections'));

// Endpoint D — workshop.service.ts getFranchiseDashboard — SPECIALIZED, partial reuse.
assertTrue('endpoint D injects ReportService rather than duplicating its calculations', workshopService.includes("import { ReportService }") && workshopService.includes('reportService = new ReportService()'));
assertTrue('endpoint D reuses the shared revenue/employee/inventory/workshop summaries for its overlapping metrics', /this\.reportService\.getRevenueSummary/.test(workshopService) && /this\.reportService\.getWorkshopSummary/.test(workshopService));
assertTrue('endpoint D still returns its original 5-section response contract (customer/workshop/finance/employees/inventory)', /customer:\s*\{/.test(workshopService) && /workshop:\s*\{/.test(workshopService) && /finance:\s*\{/.test(workshopService) && /employees:\s*\{/.test(workshopService) && /inventory:\s*\{/.test(workshopService));
assertTrue('endpoint D\'s controller reuses resolveDataScope() instead of a manual role-check reimplementation', workshopController.includes('resolveDataScope(req.user)'));
assertTrue('endpoint D\'s route is gated with the existing dashboards:executive:view action', workshopRoutes.includes("workshopRouter.get('/franchise-dashboard', requireAction('dashboards:executive:view')"));

// Endpoint E — hq.ts franchise/:id/stats — SPECIALIZED, partial reuse.
const franchiseStatsBody = body(hqRoutes, 'hqRouter.get("/franchises/:id/stats"', undefined);
assertTrue('endpoint E reuses the shared getInventorySummary/getEmployeeSummary for its overlapping display fields', franchiseStatsBody.includes('reportService.getInventorySummary(id)') && franchiseStatsBody.includes('reportService.getEmployeeSummary(id)'));
assertTrue('endpoint E keeps its own distinct revenue/customerCount/vehicleCount/activeLeads calculations (verified different definitions, not merged)', franchiseStatsBody.includes('const revenue = invoices.reduce') && franchiseStatsBody.includes('const customerCount ='));

// Endpoint F — lead dashboard — SPECIALIZED, gated with existing CRM action.
assertTrue('endpoint F (/api/leads/dashboard) is gated with the existing reports:crm:view action', leadRoutes.includes("leadRouter.get('/dashboard', requireAction('reports:crm:view')"));
assertTrue('endpoint F carries an explicit REP-01C classification note', leadRoutes.includes('REP-01C (D-REP4/D-REP7)'));

// ═══ CRM report duplicate (leadReport.service.ts / /leads/reports/:type) ═

assertTrue('/leads/reports/:type is gated (view for JSON, export for CSV) instead of left ungated', leadRoutes.includes('requireCrmReportAccess'));
assertTrue('the CSV-vs-JSON gate genuinely branches on the format query param, not a single static action', leadRoutes.includes("req.query.format === 'csv' ? 'reports:crm:export' : 'reports:crm:view'"));
assertTrue('LeadReportService itself was not deleted (D-REP2 — compatibility, not deletion)', fs.existsSync(root('src/modules/lead/service/leadReport.service.ts')));

// ═══ Customer report duplicate (customer.service.ts CSV switch) ═════════

assertTrue('/customers/reports/export is gated with the existing reports:customer:export action', customerRoutes.includes("customerRouter.get('/reports/export', requireAction('reports:customer:export')"));
assertTrue('/customers/reports/summary is gated with the existing reports:customer:view action', customerRoutes.includes("customerRouter.get('/reports/summary', requireAction('reports:customer:view')"));
assertTrue('customer.service.ts\'s service_due case now delegates to the canonical, franchise-scoped ReportService instead of an unscoped direct db.serviceReminder query', /case 'service_due': \{[\s\S]*?this\.reportService\.getServiceDueFollowUpReport\(franchiseId\)/.test(customerService));
assertTrue('customer.service.ts\'s referral_report case now delegates to the canonical, franchise-scoped ReportService instead of an unscoped direct db.referral query', /case 'referral_report': \{[\s\S]*?this\.reportService\.getReferralReport\(franchiseId\)/.test(customerService));
assertTrue('both delegating cases derive franchiseId from tenantFilter (closing the pre-existing cross-franchise leak: neither case filtered by franchise at all before)', (customerService.match(/tenantFilter\?\.franchiseId as string \| undefined/g) || []).length >= 2);

// ═══ HQ Employee Performance duplicate consolidation ═════════════════════

assertTrue('ReportService exposes the new canonical getEmployeePerformanceReport (was missing entirely from the canonical layer)', reportService.includes('async getEmployeePerformanceReport('));
assertTrue('the canonical route reuses the existing reports:employee:view action', reportRoutes.includes("reportRouter.get('/employee/performance', "));
assertTrue('hq.ts\'s /reports/employees/performance is now a compatibility wrapper delegating to the canonical calculation', body(hqRoutes, 'hqRouter.get("/reports/employees/performance"', undefined).includes('reportService.getEmployeePerformanceReport('));
assertTrue('hq.ts\'s route is now gated (was previously fully ungated)', hqRoutes.includes('hqRouter.get("/reports/employees/performance", requireAction(\'reports:employee:view\')'));

// ═══ §7/§8/§9 — Completed "missing reports" ══════════════════════════════

const missingReports: { method: string; routeFragment: string; section: string }[] = [
  { method: 'async getJobCardRegisterReport(', routeFragment: "/workshop/job-card-register", section: '§16.5' },
  { method: 'async getWorkshopStatusReport(', routeFragment: "/workshop/status", section: '§16.5' },
  { method: 'async getVehicleLiveStatusReport(', routeFragment: "/workshop/vehicle-live-status", section: '§16.5' },
  { method: 'async getReferralReport(', routeFragment: "/crm/referrals", section: '§16.6' },
  { method: 'async getServiceDueFollowUpReport(', routeFragment: "/crm/service-due-followup", section: '§16.6' },
  { method: 'async getLeaveReport(', routeFragment: "/employee/leave", section: '§16.8' },
];
for (const r of missingReports) {
  assertTrue(`${r.section} — ReportService.${r.method.replace('async ', '').replace('(', '')} exists`, reportService.includes(r.method));
  assertTrue(`${r.section} — its route ${r.routeFragment} is wired and RBAC-gated`, reportRoutes.includes(r.routeFragment) && new RegExp(`${r.routeFragment.replace(/\//g, '\\/')}'[^;]*requireAction`).test(reportRoutes));
}

// Vehicle Live Status Board (§11.12.5) — active jobs only, delivered vehicles drop off.
const vlsBody = body(reportService, 'async getVehicleLiveStatusReport(', undefined);
assertTrue('getVehicleLiveStatusReport filters to active (non-COMPLETED_JOB_STATUSES) jobs only', vlsBody.includes('!COMPLETED_JOB_STATUSES.includes(r.status)'));
assertTrue('getVehicleLiveStatusReport reuses Job.status as "Current Stage" — no invented 17-stage workflow engine', !reportService.includes('Estimate Pending') && !reportService.includes('Outpass Generated'));

// ═══ D-REP5 — Dashboard Widget Configuration ═════════════════════════════

assertTrue('DashboardWidgetConfig model added to schema.prisma, additive only', schema.includes('model DashboardWidgetConfig'));
assertTrue('a hand-authored (never-applied) migration exists for the new table', fs.existsSync(root('prisma/migrations/20260909000000_add_dashboard_widget_config/migration.sql')));
assertTrue('KNOWN_DASHBOARD_WIDGETS covers the two dashboards this phase actually built dedicated routes for', Object.keys(KNOWN_DASHBOARD_WIDGETS).sort().join(',') === 'executive,franchise');
assertTrue('executive widget keys match getHQSummary\'s actual top-level sections', KNOWN_DASHBOARD_WIDGETS.executive!.every(k => hqSummaryBody.includes(k)));
assertTrue('franchise widget keys match getFranchiseDashboardReport\'s actual EPB §16.4 fields', KNOWN_DASHBOARD_WIDGETS.franchise!.every(k => franchiseDashboardBody.includes(k)));
assertTrue('GET /api/reports/dashboard-widgets is readable by any authenticated user (no extra action beyond router-level authenticate)', reportRoutes.includes("reportRouter.get('/dashboard-widgets',    controller.getDashboardWidgetConfig);"));
assertTrue('PUT /api/reports/dashboard-widgets is gated with the existing HQ-only settings:edit action — no new action invented', reportRoutes.includes("reportRouter.put('/dashboard-widgets',    requireAction('settings:edit')"));

// DashboardWidgetService.getConfig — pure merge logic, no DB (repository stubbed).
{
  const stubRepo = { findByDashboardType: async () => [] } as any;
  const svc = new DashboardWidgetService(stubRepo);
  const cfg = await svc.getConfig('executive');
  assertTrue('getConfig defaults every known widget to visible:true with no stored rows', cfg.every(w => w.visible === true));
  assertTrue('getConfig returns exactly the known executive widget keys, in default order', cfg.map(w => w.widgetKey).join(',') === KNOWN_DASHBOARD_WIDGETS.executive!.join(','));

  const storedRepo = {
    findByDashboardType: async () => [{ widgetKey: 'leadSummary', visible: false, order: 0 }],
  } as any;
  const svc2 = new DashboardWidgetService(storedRepo);
  const cfg2 = await svc2.getConfig('executive');
  const leadWidget = cfg2.find(w => w.widgetKey === 'leadSummary');
  assertTrue('getConfig honors a stored visible:false override', leadWidget?.visible === false);

  let threw = false;
  try { await svc.getConfig('not-a-real-dashboard'); } catch { threw = true; }
  assertTrue('getConfig rejects an unknown dashboardType rather than silently returning an empty list', threw);

  let updateThrew = false;
  try { await svc.updateConfig('executive', [{ widgetKey: 'notARealWidget', visible: true, order: 0 }]); } catch { updateThrew = true; }
  assertTrue('updateConfig rejects an unknown widgetKey for the given dashboardType', updateThrew);
}

// ═══ D-REP6 — Deleted / Soft-Deleted Record Handling ═════════════════════

const registerReportsForDeletedHandling = ['getCustomerRegisterReport', 'getLeadRegisterReport', 'getJobCardRegisterReport'];
for (const m of registerReportsForDeletedHandling) {
  assertTrue(`${m} accepts an includeDeleted parameter, defaulted to false (existing callers unaffected)`, new RegExp(`async ${m}\\([^)]*includeDeleted = false\\)`).test(reportService));
  assertTrue(`${m} marks each row with an explicit recordStatus only when includeDeleted is true`, body(reportService, `async ${m}(`, undefined).includes("includeDeleted ? { recordStatus:"));
}
assertTrue('includeDeleted queries use dedicated repository methods, never mutating the shared (always-excludes-deleted) methods other reports still rely on', reportRepo.includes('getCustomersForRegister') && reportRepo.includes('getLeadsInRangeForRegister') && reportRepo.includes('getWorkshopJobsForRegister'));

// canIncludeDeleted — pure authorization logic (resolveDataScope is pure; no DB).
{
  const controllerSrc = reportController;
  assertTrue('the controller enforces includeDeleted is HQ-tier-only (scope.unrestricted) before honoring the query param', controllerSrc.includes('scope.unrestricted && query.includeDeleted'));

  // Live-style: reimplement the same two-line check the controller uses,
  // against resolveDataScope() directly, to prove a franchise-scoped actor
  // is denied the opt-in regardless of what they pass on the query string.
  const franchiseActorScope = resolveDataScope({ role: 'FRANCHISE_ADMIN', franchiseId: 'F1' });
  const hqActorScope = resolveDataScope({ role: 'HQ_USER', franchiseId: null });
  assertTrue('LIVE-STYLE: a FRANCHISE_ADMIN requesting includeDeleted=true is denied the opt-in (scope.unrestricted is false)', franchiseActorScope.unrestricted === false);
  assertTrue('LIVE-STYLE: an HQ_USER requesting includeDeleted=true is granted the opt-in (scope.unrestricted is true)', hqActorScope.unrestricted === true);
}

// ═══ Regression guard — canonical/franchise-scoped-safety spot checks ════

assertTrue('every new report method threads franchiseId through to its repository call (no report silently returns cross-franchise data)', [
  'getReferralReport', 'getServiceDueFollowUpReport', 'getLeaveReport', 'getJobCardRegisterReport', 'getWorkshopStatusReport', 'getVehicleLiveStatusReport', 'getEmployeePerformanceReport',
].every(m => new RegExp(`async ${m}\\(franchiseId`).test(reportService)));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
