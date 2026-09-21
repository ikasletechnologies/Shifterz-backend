import { ForbiddenError } from '../../../shared/errors/ForbiddenError.js';

export interface NoteActor {
  id?: string;
  role?: string;
  franchiseId?: string | null;
}

// Phase A (locked) — same authority tier as D-10 (billing:cancel) / D-11
// (payments:refund): SUPER_ADMIN/HQ_USER globally, FRANCHISE_ADMIN within
// their own franchise (franchise membership itself is checked separately via
// assertWithinScope), nobody else. Shared by both GstCreditNoteService and
// GstDebitNoteService rather than duplicated, since the rule is identical.
export const ALLOWED_NOTE_ROLES = ['SUPER_ADMIN', 'HQ_USER', 'FRANCHISE_ADMIN'];

export function assertIssuerAuthority(actor: NoteActor | undefined, documentLabel: string) {
  const role = actor?.role || '';
  if (!ALLOWED_NOTE_ROLES.includes(role)) {
    throw new ForbiddenError(`You do not have permission to issue or cancel ${documentLabel}.`);
  }
}

// Financial-year prefix, same "Apr–Mar" convention already used for invoice
// numbering in billing.service.ts (STZ-{fy}-) — reuses InvoiceSequence for
// the actual counter rather than inventing a second numbering mechanism.
export function currentFyPrefix(base: string, date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  const fy = `${startYear.toString().slice(2)}-${endYear.toString().slice(2)}`;
  return `${base}-${fy}-`;
}
