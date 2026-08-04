import { Router } from 'express';
import { ReportController } from '../controller/report.controller.js';
import { authenticate } from '../../../middleware/auth.middleware.js';

export const reportRouter = Router();
const controller = new ReportController();

reportRouter.use(authenticate);

// ─── ERP Summary ──────────────────────────────────────────────────────────────
reportRouter.get('/', controller.getReports);

// ─── Billing Reports (13.13) ────────────────────────────────────────────────────
reportRouter.get('/billing/register',        controller.getInvoiceRegisterReport);
reportRouter.get('/billing/daily-sales',     controller.getDailySalesReport);
reportRouter.get('/billing/monthly-sales',   controller.getMonthlySalesReport);
reportRouter.get('/billing/customer-wise',   controller.getCustomerWiseRevenueReport);
reportRouter.get('/billing/franchise-wise',  controller.getFranchiseWiseRevenueReport);
reportRouter.get('/billing/gst-summary',     controller.getGstSummaryReport);
// GET /api/reports/billing/export?type=register&from=2026-01-01&to=2026-12-31
reportRouter.get('/billing/export',          controller.exportBillingCsv);

// ─── Reception Reports ────────────────────────────────────────────────────────
reportRouter.get('/reception/appointments',  controller.getAppointmentReport);
reportRouter.get('/reception/walkins',       controller.getWalkInReport);
reportRouter.get('/reception/checkins',      controller.getCheckinReport);
reportRouter.get('/reception/deliveries',    controller.getDeliveryReport);
reportRouter.get('/reception/register',      controller.getReceptionRegister);
reportRouter.get('/reception/pending',       controller.getPendingVehicles);
reportRouter.get('/reception/daily',         controller.getDailyMovement);

// ─── CSV Export ────────────────────────────────────────────────────────────────
// GET /api/reports/reception/export?type=appointments&from=2026-01-01&to=2026-12-31
reportRouter.get('/reception/export',        controller.exportReceptionCsv);

// ─── Workshop Reports (10.12) ───────────────────────────────────────────────────
reportRouter.get('/workshop/progress',   controller.getWorkProgressReport);
reportRouter.get('/workshop/workload',   controller.getEmployeeWorkloadReport);
reportRouter.get('/workshop/completed',  controller.getCompletedJobsReport);
reportRouter.get('/workshop/pending',    controller.getPendingJobsReport);
reportRouter.get('/workshop/materials',  controller.getMaterialConsumptionReport);
reportRouter.get('/workshop/delays',     controller.getDelayAnalysisReport);
// GET /api/reports/workshop/export?type=progress&from=2026-01-01&to=2026-12-31
reportRouter.get('/workshop/export',     controller.exportWorkshopCsv);

// ─── QC Reports (12.9) ───────────────────────────────────────────────────────────
reportRouter.get('/qc/register',          controller.getQcRegisterReport);
reportRouter.get('/qc/passed',            controller.getPassedVehiclesReport);
reportRouter.get('/qc/failed',            controller.getFailedVehiclesReport);
reportRouter.get('/qc/rework',            controller.getReworkReport);
reportRouter.get('/qc/performance',       controller.getQcPerformanceReport);
reportRouter.get('/qc/employee-rework',   controller.getEmployeeReworkReport);
reportRouter.get('/qc/branch',            controller.getBranchQcReport);
// GET /api/reports/qc/export?type=register&from=2026-01-01&to=2026-12-31
reportRouter.get('/qc/export',            controller.exportQcCsv);

// ─── HQ Summary (§16.3 & §16.4) ────────────────────────────────────────────────
reportRouter.get('/hq-summary',             controller.getHQSummary);

// ─── CRM Reports (§16.6) ───────────────────────────────────────────────────────
reportRouter.get('/crm/register',           controller.getLeadRegisterReport);
reportRouter.get('/crm/sources',            controller.getLeadSourceAnalysisReport);
reportRouter.get('/crm/conversion',         controller.getLeadConversionReport);
reportRouter.get('/crm/lost',               controller.getLostLeadReport);
reportRouter.get('/crm/followup-performance', controller.getLeadFollowUpPerformanceReport);
reportRouter.get('/crm/export',             controller.exportCrmCsv);

// ─── Customer Reports (§16.7) ──────────────────────────────────────────────────
reportRouter.get('/customer/register',      controller.getCustomerRegisterReport);
reportRouter.get('/customer/visits',        controller.getCustomerVisitReport);
reportRouter.get('/customer/revenue',       controller.getCustomerRevenueReport);
reportRouter.get('/customer/history',       controller.getCustomerServiceHistoryReport);
reportRouter.get('/customer/export',        controller.exportCustomerCsv);

// ─── Employee Reports (§16.8) ──────────────────────────────────────────────────
reportRouter.get('/employee/attendance',    controller.getAttendanceReport);
reportRouter.get('/employee/productivity',  controller.getTechnicianProductivityReport);
reportRouter.get('/employee/contribution',  controller.getRevenueContributionReport);
reportRouter.get('/employee/export',        controller.exportEmployeeCsv);

// ─── Financial Reports (§16.9) ─────────────────────────────────────────────────
reportRouter.get('/financial/payment-register', controller.getPaymentRegisterReport);
reportRouter.get('/financial/outstanding',      controller.getOutstandingReport);
reportRouter.get('/financial/collection',       controller.getCollectionReport);
reportRouter.get('/financial/payment-modes',    controller.getPaymentModeSummaryReport);
reportRouter.get('/financial/export',           controller.exportFinancialCsv);

// ─── Inventory Reports (§16.10) ────────────────────────────────────────────────
reportRouter.get('/inventory/register',     controller.getProductRegisterReport);
reportRouter.get('/inventory/summary',      controller.getStockSummaryReport);
reportRouter.get('/inventory/low-stock',    controller.getLowStockReport);
reportRouter.get('/inventory/valuation',    controller.getInventoryValuationReport);
reportRouter.get('/inventory/ledger',       controller.getStockLedgerReport);
reportRouter.get('/inventory/export',       controller.exportInventoryCsv);
