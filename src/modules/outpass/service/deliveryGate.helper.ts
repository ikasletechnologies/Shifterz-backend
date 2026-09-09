// EPB 2.10 — pure logic extracted from OutpassService, so the vehicle-
// release gate (job found + QC actually passed + invoice exists +
// paid/approved-credit) is directly testable without a live database, and
// so createOutpass and approveOutpass share the exact same gate rather than
// risk drifting into two different checks.
import { ValidationError } from '../../../shared/errors/ValidationError.js';

export interface JobLike {
  status: string;
  passedAt: Date | null;
}

export interface InvoiceLike {
  id: string;
  amount: number;
  gst: number;
  discount: number;
  status: string;
}

// job.passedAt is the single authoritative QC-passed signal (same one
// billing.service.ts's assertQcPassedForInvoice trusts, set only by
// qc.service.ts's decide() on a "Passed" result) — a status string like
// "QC Pending" or "Rework Required" must NOT satisfy this.
export function assertJobQcPassed(job: JobLike | null): asserts job is JobLike {
  if (!job) {
    throw new ValidationError("Cannot generate Outpass: no matching Job Card found for this vehicle.");
  }
  if (!job.passedAt) {
    throw new ValidationError(
      `Cannot generate Outpass: Job has not passed Quality Control yet (current status: "${job.status}").`
    );
  }
}

export function assertInvoicePaidOrCredit(invoice: InvoiceLike | null, totalPaid: number): asserts invoice is InvoiceLike {
  if (!invoice) {
    throw new ValidationError("Cannot generate Outpass: no Invoice found for this vehicle.");
  }
  const invoiceAmount = (invoice.amount || 0) + (invoice.gst || 0) - (invoice.discount || 0);
  const isCreditOrPaid =
    invoice.status === "Approved Credit" ||
    invoice.status === "Paid" ||
    (invoiceAmount > 0 && totalPaid >= invoiceAmount - 1);

  if (!isCreditOrPaid) {
    throw new ValidationError(
      `Cannot generate Outpass: Payment incomplete. Invoiced: ₹${invoiceAmount.toFixed(2)}, Paid: ₹${totalPaid.toFixed(2)}.`
    );
  }
}
