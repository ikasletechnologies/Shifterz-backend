import type { Response, NextFunction } from 'express';
import { ReportService } from '../service/report.service.js';
import { DashboardWidgetService } from '../service/dashboardWidget.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { logAudit } from '../../../shared/services/audit.service.js';
import { resolveDataScope } from '../../../shared/scope/dataScope.js';

export class ReportController {
  constructor(
    private readonly service: ReportService = new ReportService(),
    private readonly widgetService: DashboardWidgetService = new DashboardWidgetService()
  ) {}

  private async auditExport(req: AuthRequest, reportName: string, queryParams: any) {
    if (!req.user) return;
    await logAudit({
      module: "Reports Export",
      recordId: "NONE",
      action: "EXPORT",
      userId: req.user.username || req.user.name || req.user.id || 'unknown',
      branchId: req.user.franchiseId || null,
      ipAddress: req.ip || String(req.headers["x-forwarded-for"] || ""),
      device: req.headers["user-agent"] || "Unknown Device",
      newValue: { reportName, queryParams }
    });
  }

  // GST-11 — delegates to the single canonical scope rule (Phase 1A) instead
  // of reimplementing the SUPER_ADMIN/HQ_USER-unrestricted check locally, so
  // this can never drift from what every other module already enforces.
  private resolveScope(req: AuthRequest): { franchiseId?: string } {
    const scope = resolveDataScope({ role: req.user?.role, franchiseId: req.user?.franchiseId ?? null });
    if (scope.unrestricted) {
      return { franchiseId: req.query.franchiseId ? String(req.query.franchiseId) : undefined };
    }
    return { franchiseId: scope.franchiseId ?? undefined };
  }

  // REP-01C (D-REP6) — "authorized HQ opt-in": the caller must be the same
  // unrestricted (SUPER_ADMIN/HQ_USER) tier resolveScope() already grants a
  // cross-franchise view to, matching D-REP6's actual wording rather than
  // inventing a separate action for it. A franchise-scoped caller passing
  // ?includeDeleted=true is silently ignored (treated as false), not
  // errored — the endpoint still works, just without the opt-in.
  private canIncludeDeleted(req: AuthRequest, query: Record<string, string>): boolean {
    const scope = resolveDataScope({ role: req.user?.role, franchiseId: req.user?.franchiseId ?? null });
    return scope.unrestricted && query.includeDeleted === 'true';
  }

  // ─── Existing ERP Summary ─────────────────────────────────────────────────

  getReports = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getReports(franchiseId);
      res.json(data);
    } catch (error) {
      next(error);
    }
  };

  // ─── Dashboard Widget Configuration (D-REP5) ─────────────────────────────────

  getDashboardWidgetConfig = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const dashboardType = String(req.query.dashboardType || '');
      if (!dashboardType) {
        res.status(400).json({ error: 'Query param "dashboardType" is required.' });
        return;
      }
      const config = await this.widgetService.getConfig(dashboardType);
      res.json({ dashboardType, widgets: config });
    } catch (error) { next(error); }
  };

  updateDashboardWidgetConfig = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { dashboardType, widgets } = req.body as { dashboardType?: string; widgets?: { widgetKey: string; visible: boolean; order: number }[] };
      if (!dashboardType || !Array.isArray(widgets)) {
        res.status(400).json({ error: 'Body must include "dashboardType" (string) and "widgets" (array of {widgetKey, visible, order}).' });
        return;
      }
      const updatedBy = req.user?.username || req.user?.name || req.user?.id || 'unknown';
      const config = await this.widgetService.updateConfig(dashboardType, widgets, updatedBy);
      await logAudit({
        module: 'Dashboard Widget Config',
        recordId: dashboardType,
        action: 'UPDATE',
        userId: updatedBy,
        branchId: req.user?.franchiseId || null,
        ipAddress: req.ip || String(req.headers['x-forwarded-for'] || ''),
        device: req.headers['user-agent'] || 'Unknown Device',
        newValue: { dashboardType, widgets },
      });
      res.json({ dashboardType, widgets: config });
    } catch (error) { next(error); }
  };

  // ─── Billing Reports (§13.13) ───────────────────────────────────────────────

  getInvoiceRegisterReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getInvoiceRegisterReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getDailySalesReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getDailySalesReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getMonthlySalesReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getMonthlySalesReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getCustomerWiseRevenueReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getCustomerWiseRevenueReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getFranchiseWiseRevenueReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getFranchiseWiseRevenueReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getGstSummaryReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getGstSummaryReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getGstr1Report = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getGstr1Report(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getGstr3bReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getGstr3bReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getGstr2bReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getGstr2bReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  exportBillingCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { type, from, to } = req.query as Record<string, string>;
      if (!type) {
        res.status(400).json({ error: 'Query param "type" is required. Valid types: register, daily-sales, monthly-sales, customer-wise, franchise-wise, gst-summary, gstr1, gstr3b, gstr2b' });
        return;
      }
      const { csv, filename } = await this.service.exportBillingCsv(type, franchiseId, from, to);
      await this.auditExport(req, 'Billing', { type, from, to, franchiseId });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) { next(error); }
  };

  // ─── Reception Reports ────────────────────────────────────────────────────

  getAppointmentReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getAppointmentReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getWalkInReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getWalkInReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getCheckinReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getCheckinReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getDeliveryReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getDeliveryReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getReceptionRegister = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getReceptionRegister(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getPendingVehicles = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getPendingVehicleReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  getDailyMovement = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { date } = req.query as Record<string, string>;
      const data = await this.service.getDailyMovementReport(franchiseId, date);
      res.json(data);
    } catch (error) { next(error); }
  };

  // ─── Workshop Reports (PRD §10.12) ─────────────────────────────────────────

  getWorkProgressReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getWorkProgressReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getEmployeeWorkloadReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getEmployeeWorkloadReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  getCompletedJobsReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getCompletedJobsReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getPendingJobsReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getPendingJobsReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  getMaterialConsumptionReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getMaterialConsumptionReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getDelayAnalysisReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getDelayAnalysisReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  // REP-01C (§16.5) — the three previously-missing Operational Reports.
  getJobCardRegisterReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const query = req.query as Record<string, string>;
      const { from, to } = query;
      const data = await this.service.getJobCardRegisterReport(franchiseId, from, to, this.canIncludeDeleted(req, query));
      res.json(data);
    } catch (error) { next(error); }
  };

  getWorkshopStatusReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getWorkshopStatusReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  getVehicleLiveStatusReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getVehicleLiveStatusReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  exportWorkshopCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { type, from, to } = req.query as Record<string, string>;
      if (!type) {
        res.status(400).json({ error: 'Query param "type" is required. Valid types: progress, workload, completed, pending, materials, delays, job-card-register, vehicle-live-status' });
        return;
      }
      const { csv, filename } = await this.service.exportWorkshopCsv(type, franchiseId, from, to);
      await this.auditExport(req, 'Workshop', { type, from, to, franchiseId });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) { next(error); }
  };

  // ─── QC Reports (PRD §12.9) ─────────────────────────────────────────────────

  getQcRegisterReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getQcRegisterReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getPassedVehiclesReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getPassedVehiclesReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getFailedVehiclesReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getFailedVehiclesReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getReworkReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getReworkReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  getQcPerformanceReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getQcPerformanceReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getEmployeeReworkReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getEmployeeReworkReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  getBranchQcReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const data = await this.service.getBranchQcReport();
      res.json(data);
    } catch (error) { next(error); }
  };

  exportQcCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { type, from, to } = req.query as Record<string, string>;
      if (!type) {
        res.status(400).json({ error: 'Query param "type" is required. Valid types: register, passed, failed, rework, performance, employee-rework, branch' });
        return;
      }
      const { csv, filename } = await this.service.exportQcCsv(type, franchiseId, from, to);
      await this.auditExport(req, 'QC', { type, from, to, franchiseId });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) { next(error); }
  };

  // ─── CSV Export ────────────────────────────────────────────────────────────

  exportReceptionCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { type, from, to, date } = req.query as Record<string, string>;
      if (!type) {
        res.status(400).json({ error: 'Query param "type" is required. Valid types: appointments, walkins, checkins, deliveries, register, pending, daily' });
        return;
      }
      const { csv, filename } = await this.service.exportReceptionCsv(type, franchiseId, from, to, date);
      await this.auditExport(req, 'Reception', { type, from, to, date, franchiseId });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) { next(error); }
  };

  // ─── HQ Summary (§16.3) ──────────────────────────────────────────────────────
  getHQSummary = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getHQSummary(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  // ─── Franchise Dashboard (§16.4) ─────────────────────────────────────────────
  // REP-01C (D-REP3) — canonical franchise dashboard. resolveScope() already
  // gives the right answer for both cases: a franchise-scoped actor's own
  // franchiseId always wins (a client-supplied ?franchiseId= is ignored for
  // them, same as every other report), while an unrestricted HQ actor may
  // pass ?franchiseId= to inspect a specific franchise. Unlike getHQSummary
  // (which treats "no franchiseId" as "all franchises"), a franchise
  // dashboard is inherently about exactly one franchise, so an HQ actor
  // must supply one.
  getFranchiseDashboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      if (!franchiseId) {
        res.status(400).json({ error: 'franchiseId is required to view a franchise dashboard.' });
        return;
      }
      const data = await this.service.getFranchiseDashboardReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  // ─── CRM Reports (§16.6) ─────────────────────────────────────────────────────
  getLeadRegisterReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const query = req.query as Record<string, string>;
      const { from, to } = query;
      const data = await this.service.getLeadRegisterReport(franchiseId, from, to, this.canIncludeDeleted(req, query));
      res.json(data);
    } catch (error) { next(error); }
  };

  getLeadSourceAnalysisReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getLeadSourceAnalysisReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getLeadConversionReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getLeadConversionReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getLostLeadReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getLostLeadReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getLeadFollowUpPerformanceReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getFollowUpPerformanceReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  // REP-01C (§16.6) — previously-missing CRM reports.
  getReferralReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getReferralReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getServiceDueFollowUpReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getServiceDueFollowUpReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  exportCrmCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { type = 'register', from, to } = req.query as Record<string, string>;
      const { csv, filename } = await this.service.exportCrmCsv(type, franchiseId, from, to);
      await this.auditExport(req, 'CRM', { type, from, to, franchiseId });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) { next(error); }
  };

  // ─── Customer Reports (§16.7) ────────────────────────────────────────────────
  getCustomerRegisterReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const query = req.query as Record<string, string>;
      const data = await this.service.getCustomerRegisterReport(franchiseId, this.canIncludeDeleted(req, query));
      res.json(data);
    } catch (error) { next(error); }
  };

  getCustomerVisitReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getCustomerVisitReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getCustomerRevenueReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getCustomerRevenueReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getCustomerServiceHistoryReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getCustomerServiceHistoryReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  exportCustomerCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { type = 'register', from, to } = req.query as Record<string, string>;
      const { csv, filename } = await this.service.exportCustomerCsv(type, franchiseId, from, to);
      await this.auditExport(req, 'Customer', { type, from, to, franchiseId });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) { next(error); }
  };

  // ─── Employee Reports (§16.8) ────────────────────────────────────────────────
  getAttendanceReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getAttendanceReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  getTechnicianProductivityReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getTechnicianProductivityReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getRevenueContributionReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getRevenueContributionReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  // REP-01C — canonical Leave Report (§16.8's missing report).
  getLeaveReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getLeaveReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  // REP-01C — canonical Employee Performance Report (§16.8's missing
  // report), consolidating the hq.ts/leadReport.service.ts duplicates.
  getEmployeePerformanceReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { timeframe } = req.query as Record<string, string>;
      const data = await this.service.getEmployeePerformanceReport(franchiseId, timeframe);
      res.json(data);
    } catch (error) { next(error); }
  };

  exportEmployeeCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { type = 'attendance', from, to } = req.query as Record<string, string>;
      const { csv, filename } = await this.service.exportEmployeeCsv(type, franchiseId, from, to);
      await this.auditExport(req, 'Employee', { type, from, to, franchiseId });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) { next(error); }
  };

  // ─── Financial Reports (§16.9) ───────────────────────────────────────────────
  getPaymentRegisterReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getPaymentRegisterReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getOutstandingReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getOutstandingReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getCollectionReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getCollectionReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getPaymentModeSummaryReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getPaymentModeSummaryReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  exportFinancialCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { type = 'payment-register', from, to } = req.query as Record<string, string>;
      const { csv, filename } = await this.service.exportFinancialCsv(type, franchiseId, from, to);
      await this.auditExport(req, 'Financial', { type, from, to, franchiseId });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) { next(error); }
  };

  // ─── Inventory Reports (§16.10) ──────────────────────────────────────────────
  getProductRegisterReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getProductRegisterReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  getStockSummaryReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getStockSummaryReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  getLowStockReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getLowStockReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  getInventoryValuationReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const data = await this.service.getInventoryValuationReport(franchiseId);
      res.json(data);
    } catch (error) { next(error); }
  };

  getStockLedgerReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getStockLedgerReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getStockMovementReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getStockMovementReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getStockRequestReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getStockRequestReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  getDispatchReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { from, to } = req.query as Record<string, string>;
      const data = await this.service.getDispatchReport(franchiseId, from, to);
      res.json(data);
    } catch (error) { next(error); }
  };

  exportInventoryCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { type = 'register', from, to } = req.query as Record<string, string>;
      const { csv, filename } = await this.service.exportInventoryCsv(type, franchiseId, from, to);
      await this.auditExport(req, 'Inventory', { type, franchiseId, from, to });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) { next(error); }
  };
}
