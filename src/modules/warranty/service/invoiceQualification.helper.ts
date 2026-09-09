// WTY-01C (D-W2, locked) — pure qualification check for manual warranty
// creation. Mirrors the same "is this a real, finalized Invoice" bar
// billing.service.ts's own GST resolution and generateFromInvoice's
// automatic trigger already use (type === 'Invoice', not a
// Quotation/Estimate; not soft-deleted; not Cancelled) — not a new,
// stricter policy invented for this path.
import { ValidationError, NotFoundError } from '../../../shared/errors/index.js';

export interface QualifyingInvoiceLike {
  type: string;
  isDeleted: boolean;
  status: string;
  franchiseId: string | null;
}

export function assertQualifyingInvoice(invoice: QualifyingInvoiceLike | null): asserts invoice is QualifyingInvoiceLike {
  if (!invoice) {
    throw new NotFoundError('Invoice not found.');
  }
  if (invoice.isDeleted) {
    throw new NotFoundError('Invoice not found.');
  }
  if (invoice.type !== 'Invoice') {
    throw new ValidationError('A warranty can only be created against a finalized Invoice, not a Quotation or Estimate.');
  }
  if (invoice.status === 'Cancelled') {
    throw new ValidationError('A warranty cannot be created against a cancelled invoice.');
  }
}
