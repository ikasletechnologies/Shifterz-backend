import type { Response, NextFunction } from 'express';
import { ReportService } from '../service/report.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';

export class ReportController {
  constructor(private readonly service: ReportService = new ReportService()) {}

  private resolveScope(req: AuthRequest): { franchiseId?: string } {
    const userRole = req.user?.role || 'UNKNOWN';
    let franchiseId = req.user?.franchiseId || undefined;
    if (userRole === 'SUPER_ADMIN' || userRole === 'HQ_USER') {
      franchiseId = req.query.franchiseId ? String(req.query.franchiseId) : undefined;
    }
    return { franchiseId };
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

  exportBillingCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { type, from, to } = req.query as Record<string, string>;
      if (!type) {
        res.status(400).json({ error: 'Query param "type" is required. Valid types: register, daily-sales, monthly-sales, customer-wise, franchise-wise, gst-summary' });
        return;
      }
      const { csv, filename } = await this.service.exportBillingCsv(type, franchiseId, from, to);
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

  exportWorkshopCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { franchiseId } = this.resolveScope(req);
      const { type, from, to } = req.query as Record<string, string>;
      if (!type) {
        res.status(400).json({ error: 'Query param "type" is required. Valid types: progress, workload, completed, pending, materials, delays' });
        return;
      }
      const { csv, filename } = await this.service.exportWorkshopCsv(type, franchiseId, from, to);
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
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) { next(error); }
  };
}
