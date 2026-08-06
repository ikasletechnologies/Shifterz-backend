import type { Request, Response, NextFunction } from 'express';
import { LeadService } from '../service/lead.service.js';
import type { AuthRequest } from '../../../middleware/auth.middleware.js';
import { db } from '../../../lib/db.js';
import { logAudit } from '../../../shared/services/audit.service.js';

export class LeadController {
  private service: LeadService;

  constructor() {
    this.service = new LeadService();
  }

  getLeads = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      let tenantFilter = {};
      if (req.user) {
        if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "HQ_USER" && req.user.franchiseId) {
          tenantFilter = { franchiseId: req.user.franchiseId };
        }
      }

      const leads = await this.service.getLeads(tenantFilter);
      res.json(leads);
    } catch (error) {
      next(error);
    }
  };

  createLead = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const franchiseId = req.user?.franchiseId || null;
      const createdBy = req.user?.name || req.user?.id || "System";
      const lead = await this.service.createLead(req.body, franchiseId, createdBy);
      await logAudit({
        module: "LEAD",
        recordId: lead.id,
        action: "CREATE",
        userId: req.user?.id || "unknown",
        branchId: franchiseId,
        oldValue: null,
        newValue: lead,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(lead);
    } catch (error) {
      next(error);
    }
  };

  updateLead = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const updatedBy = req.user?.name || req.user?.id || "System";
      const oldValue = await db.lead.findUnique({ where: { id } });
      const lead = await this.service.updateLead(id, req.body, updatedBy);
      await logAudit({
        module: "LEAD",
        recordId: id,
        action: "UPDATE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: lead,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(lead);
    } catch (error) {
      next(error);
    }
  };

  deleteLead = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const oldValue = await db.lead.findUnique({ where: { id } });
      await this.service.deleteLead(id);
      await logAudit({
        module: "LEAD",
        recordId: id,
        action: "DELETE",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: null,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json({ success: true, message: "Lead deleted" });
    } catch (error) {
      next(error);
    }
  };

  transferLead = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { toFranchiseId, reason } = req.body;
      const oldValue = await db.lead.findUnique({ where: { id } });
      const lead = await this.service.transferLead(id, toFranchiseId);
      await logAudit({
        module: "LEAD",
        recordId: id,
        action: "TRANSFER",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: { lead, reason },
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json(lead);
    } catch (error) {
      next(error);
    }
  };

  getAssignmentHistory = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const leadId = String(req.params.id);
      const history = await this.service.getAssignmentHistory(leadId);
      res.json(history);
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/leads/:id/convert
   * Explicitly converts a lead to a customer record.
   * Idempotent — safe to call multiple times.
   */
  convertLead = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const convertedBy = req.user?.name || req.user?.id || "System";
      const oldValue = await db.lead.findUnique({ where: { id } });
      const customer = await this.service.convertLead(id, convertedBy);
      await logAudit({
        module: "LEAD",
        recordId: id,
        action: "CONVERT",
        userId: req.user?.id || "unknown",
        branchId: req.user?.franchiseId || null,
        oldValue,
        newValue: customer,
        ipAddress: req.ip,
        device: req.headers['user-agent'],
      });
      res.json({ success: true, customer });
    } catch (error) {
      next(error);
    }
  };
}

