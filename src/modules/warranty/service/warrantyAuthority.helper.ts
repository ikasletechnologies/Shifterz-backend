// WTY-01C (D-W5, locked) — SUPER_ADMIN/HQ_USER only may modify, delete, or
// resolve a claim against a warranty; mirrors the same narrow authority
// tier already locked for Inventory dispatch/approval (D-16-style) and
// Inventory Product Request approval (INV-05), not a new role matrix. Read
// and creation remain open to any franchise-scoped authenticated actor —
// this check applies only to the three modify-class operations.
import { ForbiddenError } from '../../../shared/errors/index.js';

export const WARRANTY_MODIFY_ROLES = ['SUPER_ADMIN', 'HQ_USER'];

export function assertWarrantyModifyAuthority(role: string | undefined): void {
  if (!role || !WARRANTY_MODIFY_ROLES.includes(role)) {
    throw new ForbiddenError('Only Headquarters may modify, delete, or resolve a claim against a warranty.');
  }
}
