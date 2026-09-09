import { Router } from 'express';
import { ReportController } from '../controller/report.controller.js';
import { authenticate, requireAction } from '../../../middleware/auth.middleware.js';

export const reportRouter = Router();
const controller = new ReportController();

reportRouter.use(authenticate);

// ─── ERP Summary ──────────────────────────────────────────────────────────────
// Not a D-13 named domain — left ungated, matching "do not blindly add
// permissions to every CRUD endpoint."
reportRouter.get('/', controller.getReports);

// ─── Dashboard Widget Configuration (D-REP5) ───────────────────────────────────
// Read: any authenticated user (needed to render their own dashboard).
// Write: settings:edit — the same existing, already-locked HQ-only action
// (D-12 excludes FRANCHISE_ADMIN) used for every other org-wide config
// change; no new action invented for this.
reportRouter.get('/dashboard-widgets',    controller.getDashboardWidgetConfig);
reportRouter.put('/dashboard-widgets',    requireAction('settings:edit'), controller.updateDashboardWidgetConfig);

// ─── Billing Reports (13.13) ────────────────────────────────────────────────────
// RBAC-04 — D-13. requireAction() is additive: ReportController.resolveScope()
// (deduplicated onto resolveDataScope() in GST-11) still runs inside every
// handler below and is unchanged — the action grant controls who may reach
// the route, franchise scope still controls which rows they see.
reportRouter.get('/billing/register',        requireAction('reports:billing:view'), controller.getInvoiceRegisterReport);
reportRouter.get('/billing/daily-sales',     requireAction('reports:billing:view'), controller.getDailySalesReport);
reportRouter.get('/billing/monthly-sales',   requireAction('reports:billing:view'), controller.getMonthlySalesReport);
reportRouter.get('/billing/customer-wise',   requireAction('reports:billing:view'), controller.getCustomerWiseRevenueReport);
reportRouter.get('/billing/franchise-wise',  requireAction('reports:billing:view'), controller.getFranchiseWiseRevenueReport);
reportRouter.get('/billing/gst-summary',     requireAction('reports:billing:view'), controller.getGstSummaryReport);
reportRouter.get('/billing/gstr1',           requireAction('reports:billing:view'), controller.getGstr1Report);
reportRouter.get('/billing/gstr3b',          requireAction('reports:billing:view'), controller.getGstr3bReport);
reportRouter.get('/billing/gstr2b',          requireAction('reports:billing:view'), controller.getGstr2bReport);
// GET /api/reports/billing/export?type=register&from=2026-01-01&to=2026-12-31
reportRouter.get('/billing/export',          requireAction('reports:billing:export'), controller.exportBillingCsv);

// ─── Reception Reports ────────────────────────────────────────────────────────
reportRouter.get('/reception/appointments',  requireAction('reports:reception:view'), controller.getAppointmentReport);
reportRouter.get('/reception/walkins',       requireAction('reports:reception:view'), controller.getWalkInReport);
reportRouter.get('/reception/checkins',      requireAction('reports:reception:view'), controller.getCheckinReport);
reportRouter.get('/reception/deliveries',    requireAction('reports:reception:view'), controller.getDeliveryReport);
reportRouter.get('/reception/register',      requireAction('reports:reception:view'), controller.getReceptionRegister);
reportRouter.get('/reception/pending',       requireAction('reports:reception:view'), controller.getPendingVehicles);
reportRouter.get('/reception/daily',         requireAction('reports:reception:view'), controller.getDailyMovement);

// ─── CSV Export ────────────────────────────────────────────────────────────────
// GET /api/reports/reception/export?type=appointments&from=2026-01-01&to=2026-12-31
reportRouter.get('/reception/export',        requireAction('reports:reception:export'), controller.exportReceptionCsv);

// ─── Workshop Reports (10.12) ───────────────────────────────────────────────────
reportRouter.get('/workshop/progress',   requireAction('reports:workshop:view'), controller.getWorkProgressReport);
reportRouter.get('/workshop/workload',   requireAction('reports:workshop:view'), controller.getEmployeeWorkloadReport);
reportRouter.get('/workshop/completed',  requireAction('reports:workshop:view'), controller.getCompletedJobsReport);
reportRouter.get('/workshop/pending',    requireAction('reports:workshop:view'), controller.getPendingJobsReport);
reportRouter.get('/workshop/materials',  requireAction('reports:workshop:view'), controller.getMaterialConsumptionReport);
reportRouter.get('/workshop/delays',     requireAction('reports:workshop:view'), controller.getDelayAnalysisReport);
// REP-01C — previously-missing §16.5 Operational Reports; same
// reports:workshop:view action as their siblings above.
reportRouter.get('/workshop/job-card-register',   requireAction('reports:workshop:view'), controller.getJobCardRegisterReport);
reportRouter.get('/workshop/status',              requireAction('reports:workshop:view'), controller.getWorkshopStatusReport);
reportRouter.get('/workshop/vehicle-live-status', requireAction('reports:workshop:view'), controller.getVehicleLiveStatusReport);
// GET /api/reports/workshop/export?type=progress&from=2026-01-01&to=2026-12-31
reportRouter.get('/workshop/export',     requireAction('reports:workshop:export'), controller.exportWorkshopCsv);

// ─── QC Reports (12.9) ───────────────────────────────────────────────────────────
reportRouter.get('/qc/register',          requireAction('reports:qc:view'), controller.getQcRegisterReport);
reportRouter.get('/qc/passed',            requireAction('reports:qc:view'), controller.getPassedVehiclesReport);
reportRouter.get('/qc/failed',            requireAction('reports:qc:view'), controller.getFailedVehiclesReport);
reportRouter.get('/qc/rework',            requireAction('reports:qc:view'), controller.getReworkReport);
reportRouter.get('/qc/performance',       requireAction('reports:qc:view'), controller.getQcPerformanceReport);
reportRouter.get('/qc/employee-rework',   requireAction('reports:qc:view'), controller.getEmployeeReworkReport);
reportRouter.get('/qc/branch',            requireAction('reports:qc:view'), controller.getBranchQcReport);
// GET /api/reports/qc/export?type=register&from=2026-01-01&to=2026-12-31
reportRouter.get('/qc/export',            requireAction('reports:qc:export'), controller.exportQcCsv);

// ─── HQ Summary (§16.3 & §16.4) ────────────────────────────────────────────────
// RBAC-01's own note flagged this as the one report sub-resource D-13
// explicitly says must NOT be franchise-accessible at all — the highest-
// priority route in this whole batch to actually gate.
reportRouter.get('/hq-summary',             requireAction('reports:hq-summary:view'), controller.getHQSummary);
// REP-01C (D-REP3/D-REP7) — the canonical Franchise Dashboard. Gated by
// the existing, already-locked D-21 dashboards:executive:view action
// (proposed for HQ_USER/FRANCHISE_ADMIN/BRANCH_MANAGER in
// defaultGrants.ts) — not a new action. This is the same action D-21
// originally covered but could never wire, because the old monolithic
// /api/dashboard endpoint couldn't be split into 6 separate
// dashboards:*-gated routes; this new, genuinely separate franchise-
// dashboard route can be.
reportRouter.get('/franchise-dashboard',    requireAction('dashboards:executive:view'), controller.getFranchiseDashboard);

// ─── CRM Reports (§16.6) ───────────────────────────────────────────────────────
reportRouter.get('/crm/register',           requireAction('reports:crm:view'), controller.getLeadRegisterReport);
reportRouter.get('/crm/sources',            requireAction('reports:crm:view'), controller.getLeadSourceAnalysisReport);
reportRouter.get('/crm/conversion',         requireAction('reports:crm:view'), controller.getLeadConversionReport);
reportRouter.get('/crm/lost',               requireAction('reports:crm:view'), controller.getLostLeadReport);
reportRouter.get('/crm/followup-performance', requireAction('reports:crm:view'), controller.getLeadFollowUpPerformanceReport);
// REP-01C — previously-missing CRM reports (§16.6); same reports:crm:view
// action as their siblings above.
reportRouter.get('/crm/referrals',            requireAction('reports:crm:view'), controller.getReferralReport);
reportRouter.get('/crm/service-due-followup', requireAction('reports:crm:view'), controller.getServiceDueFollowUpReport);
reportRouter.get('/crm/export',             requireAction('reports:crm:export'), controller.exportCrmCsv);

// ─── Customer Reports (§16.7) ──────────────────────────────────────────────────
reportRouter.get('/customer/register',      requireAction('reports:customer:view'), controller.getCustomerRegisterReport);
reportRouter.get('/customer/visits',        requireAction('reports:customer:view'), controller.getCustomerVisitReport);
reportRouter.get('/customer/revenue',       requireAction('reports:customer:view'), controller.getCustomerRevenueReport);
reportRouter.get('/customer/history',       requireAction('reports:customer:view'), controller.getCustomerServiceHistoryReport);
reportRouter.get('/customer/export',        requireAction('reports:customer:export'), controller.exportCustomerCsv);

// ─── Employee Reports (§16.8) ──────────────────────────────────────────────────
reportRouter.get('/employee/attendance',    requireAction('reports:employee:view'), controller.getAttendanceReport);
reportRouter.get('/employee/productivity',  requireAction('reports:employee:view'), controller.getTechnicianProductivityReport);
reportRouter.get('/employee/contribution',  requireAction('reports:employee:view'), controller.getRevenueContributionReport);
// REP-01C — new canonical routes for the previously-missing Leave Report
// and Employee Performance Report; same reports:employee:view action as
// their siblings.
reportRouter.get('/employee/leave',         requireAction('reports:employee:view'), controller.getLeaveReport);
reportRouter.get('/employee/performance',   requireAction('reports:employee:view'), controller.getEmployeePerformanceReport);
reportRouter.get('/employee/export',        requireAction('reports:employee:export'), controller.exportEmployeeCsv);

// ─── Financial Reports (§16.9) ─────────────────────────────────────────────────
reportRouter.get('/financial/payment-register', requireAction('reports:financial:view'), controller.getPaymentRegisterReport);
reportRouter.get('/financial/outstanding',      requireAction('reports:financial:view'), controller.getOutstandingReport);
reportRouter.get('/financial/collection',       requireAction('reports:financial:view'), controller.getCollectionReport);
reportRouter.get('/financial/payment-modes',    requireAction('reports:financial:view'), controller.getPaymentModeSummaryReport);
reportRouter.get('/financial/export',           requireAction('reports:financial:export'), controller.exportFinancialCsv);

// ─── Inventory Reports (§16.10) ────────────────────────────────────────────────
reportRouter.get('/inventory/register',     requireAction('reports:inventory:view'), controller.getProductRegisterReport);
reportRouter.get('/inventory/summary',      requireAction('reports:inventory:view'), controller.getStockSummaryReport);
reportRouter.get('/inventory/low-stock',    requireAction('reports:inventory:view'), controller.getLowStockReport);
reportRouter.get('/inventory/valuation',    requireAction('reports:inventory:view'), controller.getInventoryValuationReport);
reportRouter.get('/inventory/ledger',       requireAction('reports:inventory:view'), controller.getStockLedgerReport);
// INV-06B — EPB §16.10 explicitly names these as separate required
// reports; same `reports:inventory:view`/`reports:inventory:export`
// actions as every other inventory report, no new permission invented.
reportRouter.get('/inventory/movement',       requireAction('reports:inventory:view'), controller.getStockMovementReport);
reportRouter.get('/inventory/stock-requests', requireAction('reports:inventory:view'), controller.getStockRequestReport);
reportRouter.get('/inventory/dispatches',     requireAction('reports:inventory:view'), controller.getDispatchReport);
reportRouter.get('/inventory/export',       requireAction('reports:inventory:export'), controller.exportInventoryCsv);
