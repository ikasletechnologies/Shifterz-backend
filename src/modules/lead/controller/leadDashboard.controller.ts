import type { Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { LeadDashboardService } from '../service/leadDashboard.service.js';
import { LeadReportService } from '../service/leadReport.service.js';
import { resolveDataScope } from '../../../shared/scope/dataScope.js';

export class LeadDashboardController {
  private dashboardService: LeadDashboardService;
  private reportService: LeadReportService;

  constructor() {
    this.dashboardService = new LeadDashboardService();
    this.reportService = new LeadReportService();
  }

  getDashboard = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = resolveDataScope(req.user);
      const isHQ = scope.unrestricted;
      const franchiseId = isHQ
        ? (req.query.franchiseId && req.query.franchiseId !== 'all' && req.query.franchiseId !== 'All' ? String(req.query.franchiseId) : null)
        : scope.franchiseId;
      const data = await this.dashboardService.getDashboardData(franchiseId, isHQ && !franchiseId);
      res.json(data);
    } catch (error) {
      next(error);
    }
  };

  getReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const scope = resolveDataScope(req.user);
      const isHQ = scope.unrestricted;
      const franchiseId = isHQ
        ? (req.query.franchiseId && req.query.franchiseId !== 'all' && req.query.franchiseId !== 'All' ? String(req.query.franchiseId) : null)
        : scope.franchiseId;
      const effectiveHQ = isHQ && !franchiseId;
      const type = String(req.params.type).toLowerCase();
      const format = req.query.format === 'csv' ? 'csv' : 'json';

      let reportData: any[] = [];
      let filename = 'report.csv';

      switch (type) {
        case 'register':
          reportData = await this.reportService.getLeadRegister(franchiseId, effectiveHQ);
          filename = 'lead_register.csv';
          break;
        case 'follow-up':
        case 'followup':
          reportData = await this.reportService.getFollowUpReport(franchiseId, effectiveHQ);
          filename = 'followup_report.csv';
          break;
        case 'callback':
          reportData = await this.reportService.getCallbackReport(franchiseId, effectiveHQ);
          filename = 'callback_report.csv';
          break;
        case 'conversion':
          reportData = await this.reportService.getLeadConversionReport(franchiseId, effectiveHQ);
          filename = 'lead_conversion_report.csv';
          break;
        case 'lost-analysis':
        case 'lost':
          reportData = await this.reportService.getLostLeadAnalysis(franchiseId, effectiveHQ);
          filename = 'lost_lead_analysis.csv';
          break;
        case 'source':
          reportData = await this.reportService.getLeadSourceReport(franchiseId, effectiveHQ);
          filename = 'lead_source_report.csv';
          break;
        case 'employee-performance':
        case 'employee':
          reportData = await this.reportService.getEmployeePerformanceReport(franchiseId, effectiveHQ);
          filename = 'employee_lead_performance_report.csv';
          break;
        case 'franchise-performance':
        case 'franchise':
          reportData = await this.reportService.getFranchiseLeadReport(franchiseId, effectiveHQ);
          filename = 'franchise_lead_report.csv';
          break;
        default:
          return res.status(400).json({ message: `Invalid report type: ${type}` });
      }

      if (format === 'csv') {
        const csvContent = this.reportService.toCSV(reportData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        return res.send(csvContent);
      }

      return res.json(reportData);
    } catch (error) {
      next(error);
    }
  };
}
