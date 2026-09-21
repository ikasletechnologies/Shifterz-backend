import { Router } from 'express';
import { LeadController } from '../controller/lead.controller.js';
import { LeadDashboardController } from '../controller/leadDashboard.controller.js';
import type { Response, NextFunction } from 'express';
import { validate } from '../../../middleware/validate.middleware.js';
import { authenticate, requireAction, type AuthRequest } from '../../../middleware/auth.middleware.js';
import { createLeadSchema, updateLeadSchema } from '../validation/lead.validation.js';
import { followUpRouter } from './followup.routes.js';

// REP-01C — /reports/:type serves both JSON (view) and, via
// ?format=csv, a CSV download (export) from a single route. requireAction()
// only checks one static action, so a CSV request here is routed through
// the stricter reports:crm:export action instead of view, matching the
// canonical /crm/export route's own gate; JSON requests use view as usual.
const requireCrmReportAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  const action = req.query.format === 'csv' ? 'reports:crm:export' : 'reports:crm:view';
  return requireAction(action)(req, res, next);
};

export const leadRouter = Router();
const controller = new LeadController();
const dashboardController = new LeadDashboardController();

leadRouter.use(authenticate);

// REP-01C (D-REP4/D-REP7) — endpoint F (EPB §6.14 Lead Dashboard), read
// in full during REP-01C's contract comparison: classified SPECIALIZED,
// not a compatibility duplicate of the canonical §16.4 Franchise
// Dashboard — its metrics (today's follow-ups/callbacks/overdue,
// per-source and per-employee/franchise lead analysis) are CRM-specific
// with no equivalent in ReportService's shared aggregation. Gated with
// the existing reports:crm:view action rather than a new one.
leadRouter.get('/dashboard', requireAction('reports:crm:view'), dashboardController.getDashboard);
// REP-01C (D-REP1/D-REP2) — this is the CRM report duplicate flagged in
// REP-01: LeadReportService's register/follow-up/conversion/lost/source
// report types overlap by NAME with report.service.ts's canonical
// /api/reports/crm/* equivalents, but a full side-by-side field
// comparison found they are NOT the same contract — LeadReportService
// returns human-readable CSV-style column headers ('Lead ID', 'Customer
// Name', ...) with substantially richer fields (email, city, vehicle
// make/model, priority, alternate phone) that the canonical JSON reports
// don't expose, and its status filters differ (e.g. exact 'Converted'
// here vs canonical's ['Converted','Won','Closed']). Force-merging would
// either drop real fields consumers may depend on or silently change
// report counts. Per the conservative-consolidation principle, this is
// kept as a distinct, richer CSV-export-oriented route rather than
// merged — but unified under the same reports:crm:view/:export actions
// so authorization is consistent with the canonical CRM reports.
leadRouter.get('/reports/:type', requireCrmReportAccess, dashboardController.getReport);

leadRouter.get('/', controller.getLeads);
leadRouter.post('/', validate(createLeadSchema), controller.createLead);
leadRouter.put('/:id', validate(updateLeadSchema), controller.updateLead);
leadRouter.delete('/:id', controller.deleteLead);
leadRouter.post('/:id/transfer', controller.transferLead);
leadRouter.post('/:id/convert', controller.convertLead);
leadRouter.get('/:id/assignment-history', controller.getAssignmentHistory);

// Follow-up sub-router (mergeParams allows :leadId access inside)
leadRouter.use('/:leadId/followups', followUpRouter);


