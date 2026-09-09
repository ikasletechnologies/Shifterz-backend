// RBAC-02 — the default role→action grant matrix, derived strictly from
// docs/decisions/rbac-decisions.md's "Who" sections (D-08–D-21). This is a
// PROPOSAL for the SUPER_ADMIN to review and apply via the grant-management
// API (RoleActionGrantService) — nothing in this file writes to the
// database on its own. No production data is auto-populated by importing
// this module.
//
// SUPER_ADMIN is deliberately absent: resolveActionPermissionsPure()
// already grants SUPER_ADMIN the ALL_ACTIONS sentinel unconditionally,
// ahead of consulting RolePermission.actions at all (src/lib/auth.ts) — a
// seeded row for SUPER_ADMIN would be inert, so none is proposed.
//
// Two entries required an interpretive judgment call rather than a
// mechanical read of the decision text, both flagged inline below. Neither
// invents a grant beyond what the locked decisions describe — both are
// documented so they can be corrected by restating the decision rather than
// silently trusted.
import { type KnownRole } from './actionCatalog.js';

export const DEFAULT_ROLE_ACTION_GRANTS: Partial<Record<KnownRole, string[]>> = {
  // D-08 (own franchise), D-09 (own franchise), D-10 (own franchise),
  // D-11 (own franchise), D-12 (global), D-13 (all 9 domains + hq-summary,
  // "SUPER_ADMIN/HQ_USER: global"), D-14 (own franchise), D-15 (own
  // franchise), D-16 (global, HQ-level control), D-17 (global), D-18
  // (global), D-19 (explicit cross-franchise read), D-21 (all dashboards,
  // "global dashboard data, including consolidated franchise-level
  // information").
  HQ_USER: [
    'jobs:assign', 'outpass:approve', 'billing:cancel', 'payments:refund',
    'settings:edit', 'services:edit',
    'reports:billing:view', 'reports:billing:export',
    'reports:reception:view', 'reports:reception:export',
    'reports:workshop:view', 'reports:workshop:export',
    'reports:qc:view', 'reports:qc:export',
    'reports:crm:view', 'reports:crm:export',
    'reports:customer:view', 'reports:customer:export',
    'reports:employee:view', 'reports:employee:export',
    'reports:financial:view', 'reports:financial:export',
    'reports:inventory:view', 'reports:inventory:export',
    'reports:hq-summary:view',
    'attendance:edit', 'leave:approve', 'members:transfer:approve',
    'workflow:stages:manage', 'qc:templates:manage',
    'vehicles:history:view',
    'dashboards:executive:view', 'dashboards:reception:view',
    'dashboards:workshop:view', 'dashboards:qc:view',
    'dashboards:billing:view', 'dashboards:inventory:view',
  ],

  // Own-franchise authority per D-08/09/10/11/14/15/17/18. D-12
  // (settings:edit) explicitly excludes FRANCHISE_ADMIN ("cannot edit
  // controlled settings") — not an omission. D-13 grants FRANCHISE_ADMIN
  // every report domain except reports:hq-summary:view (explicitly
  // "SUPER_ADMIN, HQ_USER only"). D-16 explicitly excludes FRANCHISE_ADMIN
  // from transfer approval ("cannot approve transfers") — the D-16 "who"
  // list is unambiguous on this, not an oversight.
  FRANCHISE_ADMIN: [
    'jobs:assign', 'outpass:approve', 'billing:cancel', 'payments:refund',
    'reports:billing:view', 'reports:billing:export',
    'reports:reception:view', 'reports:reception:export',
    'reports:workshop:view', 'reports:workshop:export',
    'reports:qc:view', 'reports:qc:export',
    'reports:crm:view', 'reports:crm:export',
    'reports:customer:view', 'reports:customer:export',
    'reports:employee:view', 'reports:employee:export',
    'reports:financial:view', 'reports:financial:export',
    'reports:inventory:view', 'reports:inventory:export',
    'attendance:edit', 'leave:approve',
    'workflow:stages:manage', 'qc:templates:manage',
    'vehicles:history:view',
    'dashboards:executive:view', 'dashboards:reception:view',
    'dashboards:workshop:view', 'dashboards:qc:view',
    'dashboards:billing:view', 'dashboards:inventory:view',
  ],

  // D-09/10/11/14/15/16/17/18 each explicitly deny BRANCH_MANAGER
  // ("cannot approve outpasses" / "No BRANCH_MANAGER cancellation
  // authority" / etc. — not an omission, each decision's own "Exceptions"
  // section says so). D-08 does not list BRANCH_MANAGER among the granted
  // roles either. D-13 grants BRANCH_MANAGER reports:billing,
  // reports:reception, reports:workshop, reports:qc, reports:crm,
  // reports:customer — explicitly NOT reports:employee/financial/inventory/
  // hq-summary (those rows list only SUPER_ADMIN/HQ_USER/FRANCHISE_ADMIN,
  // or FRANCHISE_ADMIN/BILLING_EXECUTIVE, etc., BRANCH_MANAGER absent).
  BRANCH_MANAGER: [
    'reports:billing:view', 'reports:billing:export',
    'reports:reception:view', 'reports:reception:export',
    'reports:workshop:view', 'reports:workshop:export',
    'reports:qc:view', 'reports:qc:export',
    'reports:crm:view', 'reports:crm:export',
    'reports:customer:view', 'reports:customer:export',
    'vehicles:history:view',
    'dashboards:executive:view', 'dashboards:reception:view',
    'dashboards:workshop:view', 'dashboards:qc:view',
    'dashboards:billing:view', 'dashboards:inventory:view',
  ],

  // D-13's "Who" list is explicit and unambiguous: "RECEPTION, SERVICE_
  // ADVISOR, TECHNICIAN, QUALITY_INSPECTOR — no general report/export
  // authority." The RBAC-01 catalog's own summary table used the looser
  // phrase "RECEPTION-adjacent roles" for reports:reception, which reads as
  // if it might include RECEPTION_EXECUTIVE — that catalog phrasing is
  // treated as imprecise shorthand here, not as the authoritative text;
  // the decision register's explicit "Who" list governs, so none of these
  // four roles receive any reports:* grant below. Confirm this reading is
  // correct before applying the seed — if reports access for RECEPTION_
  // EXECUTIVE/SERVICE_ADVISOR was actually intended, D-13 needs to be
  // amended, not this file.
  RECEPTION_EXECUTIVE: [
    'vehicles:history:view',
    'dashboards:reception:view',
  ],
  SERVICE_ADVISOR: [
    'vehicles:history:view',
    'dashboards:reception:view',
  ],
  TECHNICIAN: [
    'vehicles:history:view',
    'dashboards:workshop:view',
  ],
  QUALITY_INSPECTOR: [
    'vehicles:history:view',
    'dashboards:qc:view',
  ],

  // D-13 explicit: BILLING_EXECUTIVE gets reports:billing and
  // reports:financial only. D-21 explicit: dashboards:billing:view only —
  // BILLING_EXECUTIVE is not in D-21's "management roles" set
  // (SUPER_ADMIN/HQ_USER/FRANCHISE_ADMIN/BRANCH_MANAGER), so it does not
  // receive dashboards:executive:view or any other dashboard beyond its own
  // domain, matching D-21's explicit exception ("BILLING_EXECUTIVE and
  // INVENTORY_EXECUTIVE receive their respective domain dashboards, not
  // unrestricted executive reporting").
  BILLING_EXECUTIVE: [
    'reports:billing:view', 'reports:billing:export',
    'reports:financial:view', 'reports:financial:export',
    'vehicles:history:view',
    'dashboards:billing:view',
  ],

  // Same reasoning as BILLING_EXECUTIVE, D-13's reports:inventory row and
  // D-21's explicit dashboards:inventory:view.
  INVENTORY_EXECUTIVE: [
    'reports:inventory:view', 'reports:inventory:export',
    'vehicles:history:view',
    'dashboards:inventory:view',
  ],
};

// INTERPRETIVE JUDGMENT CALL, flagged for explicit confirmation before this
// matrix is treated as final:
//
// D-21's five non-executive dashboard rows (`dashboards:reception:view`,
// `:workshop:view`, `:qc:view`, `:billing:view`, `:inventory:view`) each
// carry the phrase "(+ management roles)" in the RBAC-01 catalog's role
// column, without spelling out which roles that means. This file resolves
// "management roles" to mean the same four roles D-21's own executive-
// dashboard row names explicitly (SUPER_ADMIN, HQ_USER, FRANCHISE_ADMIN,
// BRANCH_MANAGER) — i.e. HQ_USER/FRANCHISE_ADMIN/BRANCH_MANAGER see all six
// dashboards, not just their own tier's. This is a reasonable, literal
// reading (D-21's "Executive dashboard" conditions explicitly describe
// "job/workshop status, QC/completion status" as part of what the
// management tier sees), but it was not spelled out character-for-character
// in the locked decision text the way most other grants in this file are,
// so it is called out here rather than presented with the same confidence
// as, say, D-16's explicit HQ-only transfer-approval rule.
