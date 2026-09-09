import { authRepository } from '../../modules/auth/auth.repository.js';
import { db } from '../../lib/db.js';
import { logAudit } from '../services/audit.service.js';
import { ValidationError } from '../errors/ValidationError.js';
import { ForbiddenError } from '../errors/ForbiddenError.js';
import { isValidAction, isKnownRole } from './actionCatalog.js';

export interface GrantActor {
  id?: string;
  role?: string;
}

// Pure — validates a requested action list against the RBAC-01 catalog and
// deduplicates it, with zero DB dependency. A duplicate in a submitted list
// is normalized away rather than rejected outright (not a security concern,
// just client-side noise); an action not in the catalog is rejected.
export function normalizeAndValidateActions(actions: string[]): string[] {
  const unique = Array.from(new Set(actions));
  const unknown = unique.filter((a) => !isValidAction(a));
  if (unknown.length > 0) {
    throw new ValidationError(
      `Unknown action(s), not present in the RBAC-01 catalog: ${unknown.join(', ')}`
    );
  }
  return unique;
}

// Pure — SUPER_ADMIN only. Deliberately not HQ_USER: this manages the
// grants every other role (including HQ_USER itself) is checked against, so
// it sits above the "SUPER_ADMIN/HQ_USER" tier used almost everywhere else
// in this codebase, matching this phase's explicit instruction that only
// SUPER_ADMIN may modify RBAC action grants.
export function assertGrantManagerAuthority(actor?: GrantActor): void {
  if (actor?.role !== 'SUPER_ADMIN') {
    throw new ForbiddenError('Only a Super Administrator may modify RBAC action grants.');
  }
}

export class RoleActionGrantService {
  // Replaces the full action list for a role. Atomic: the grant write and
  // its audit event commit or roll back together (logAudit's tx argument
  // propagates its own failure instead of swallowing it when called this
  // way — see audit.service.ts). Never touches RolePermission.permissions
  // (the legacy module-permission list) — the update path here writes only
  // `actions`.
  async setRoleActions(role: string, actions: string[], actor?: GrantActor) {
    assertGrantManagerAuthority(actor);

    if (!isKnownRole(role)) {
      throw new ValidationError(`Unknown role: ${role}`);
    }

    const normalizedActions = normalizeAndValidateActions(actions);
    const existing = await authRepository.findRolePermission(role);

    const saved = await db.$transaction(async (tx) => {
      const result = await authRepository.upsertRoleActionPermissions(role, normalizedActions, tx);

      await logAudit({
        module: 'RBAC Grant',
        recordId: role,
        action: 'SET_ROLE_ACTIONS',
        userId: actor?.id || 'unknown',
        branchId: null,
        oldValue: { role, actions: existing?.actions ?? [] },
        newValue: { role, actions: result.actions },
      }, tx);

      return result;
    });

    return saved;
  }
}
