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
