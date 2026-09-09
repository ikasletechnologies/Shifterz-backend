// RBAC-02 — the single source of truth for valid action strings, derived
// strictly from docs/decisions/rbac-01-action-catalog.md (itself derived
// strictly from docs/decisions/rbac-decisions.md, D-08–D-21). Any grant
// management API must reject an action not in this list — this is what
// keeps requireAction() calls meaningful instead of silently checking a
// string nobody agreed to.
//
// Deliberately excludes entries the catalog itself marks as not yet
// finalized (roles listed as "TBD", or explicitly flagged "candidate,
// confirm at RBAC-04"): `tax:edit` (roles TBD), `attendance:self:checkin`/
// `:checkout` (flagged "questionable whether needed"), `qc:templates:view`/
// `:use` (flagged "deferred... confirm at RBAC-04"). Adding those here
// would mean inventing decided grants for actions that were never actually
// finalized — the opposite of what this catalog is for.
export const ACTION_CATALOG = [
  // D-08
  'jobs:assign',
  // D-09
  'outpass:approve',
  // D-10
  'billing:cancel',
  // D-11
  'payments:refund',
  // D-12
  'settings:edit',
  'services:edit',
  // D-13 — one view/export pair per report domain
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
  // D-14
  'attendance:edit',
  // D-15
  'leave:approve',
  // D-16
  'members:transfer:approve',
  // D-17
  'workflow:stages:manage',
  // D-18
  'qc:templates:manage',
  // D-19
  'vehicles:history:view',
  // D-21
  'dashboards:executive:view',
  'dashboards:reception:view',
  'dashboards:workshop:view',
  'dashboards:qc:view',
  'dashboards:billing:view',
  'dashboards:inventory:view',
] as const;

export type CatalogAction = (typeof ACTION_CATALOG)[number];

export function isValidAction(action: string): action is CatalogAction {
  return (ACTION_CATALOG as readonly string[]).includes(action);
}

// The full known role roster — same list resolveUserPermissions()'s
// fallbackMatrix already uses in lib/auth.ts (not duplicated logic, just the
// same set of role strings, needed here to validate a grant-management
// request's :role param before touching the database).
export const KNOWN_ROLES = [
  'SUPER_ADMIN',
  'HQ_USER',
  'FRANCHISE_ADMIN',
  'BRANCH_MANAGER',
  'RECEPTION_EXECUTIVE',
  'SERVICE_ADVISOR',
  'TECHNICIAN',
  'QUALITY_INSPECTOR',
  'BILLING_EXECUTIVE',
  'INVENTORY_EXECUTIVE',
] as const;

export type KnownRole = (typeof KNOWN_ROLES)[number];

export function isKnownRole(role: string): role is KnownRole {
  return (KNOWN_ROLES as readonly string[]).includes(role);
}
