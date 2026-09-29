import { NotFoundError } from "../errors/index.js";

// Phase 1A — single source of truth for "what franchise-scoped data can this
// actor see." Mirrors the existing `tenant` middleware's rule (auth.middleware.ts)
// so the two never drift: only SUPER_ADMIN/HQ_USER are unrestricted.
// `hqControlled` alone does NOT grant unrestricted access — it is a derived
// mirror of `franchiseId === null` (see employee.service.ts/repository.ts),
// not an independent broad-access flag, and scripts/audit-hq-scope-invariant.ts
// already treats "non-HQ role with hqControlled=true" as an anomaly to report.
export interface ScopeActor {
  role?: string;
  franchiseId?: string | null;
  hqControlled?: boolean;
}

export interface DataScope {
  unrestricted: boolean;
  franchiseId: string | null;
}

export function resolveDataScope(actor?: ScopeActor | null): DataScope {
  const role = ((actor?.role ?? "").split("|")[0] ?? "").toUpperCase().replace(/[\s_]+/g, "_");
  if (role === "SUPER_ADMIN" || role === "HQ_USER") {
    return { unrestricted: true, franchiseId: null };
  }
  return { unrestricted: false, franchiseId: actor?.franchiseId || null };
}

export function getDataScope(actor?: ScopeActor | null) {
  const scope = resolveDataScope(actor);
  return {
    role: actor?.role,
    franchiseId: scope.franchiseId,
    unrestricted: scope.unrestricted,
    scopeWhere: scopeWhere(scope),
  };
}

// The Prisma `where` fragment that constrains a query to this scope. Spread
// this into a query's `where` clause so the database itself excludes
// out-of-scope rows — do not fetch by id first and check afterward.
export function scopeWhere(scope: DataScope): { franchiseId?: string | null } {
  if (scope.unrestricted) {
    return {};
  }
  if (!scope.franchiseId) {
    // Non-HQ role without a franchiseId MUST NEVER match Super Admin records (franchiseId === null)
    return { franchiseId: "__NO_FRANCHISE__" };
  }
  return { franchiseId: scope.franchiseId };
}

// Optional defense-in-depth check for callers that already hold a record
// (e.g. after a repository call that didn't itself apply scopeWhere). Prefer
// constraining the query itself; use this only as a second layer.
export function isWithinScope(scope: DataScope, recordFranchiseId: string | null | undefined): boolean {
  if (scope.unrestricted) return true;
  if (!scope.franchiseId) return false;
  return recordFranchiseId === scope.franchiseId;
}

export function assertWithinScope(scope: DataScope, recordFranchiseId: string | null | undefined, notFoundMessage = "Resource not found"): void {
  if (!isWithinScope(scope, recordFranchiseId)) {
    throw new NotFoundError(notFoundMessage);
  }
}
