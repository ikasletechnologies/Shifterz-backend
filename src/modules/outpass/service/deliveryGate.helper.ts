// EPB 2.10 — pure logic extracted from OutpassService, so the vehicle-
// release gate (job found + QC actually passed + invoice exists +
// paid/approved-credit) is directly testable without a live database, and
// so createOutpass/approveOutpass AND VehicleCheckinService.checkout (the
// other, independent release path) share the exact same gate rather than
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
export function assertJobQcPassed(job: JobLike | null, action = "generate an Outpass for"): asserts job is JobLike {
  if (!job) {
    throw new ValidationError(`Cannot ${action} this vehicle: no matching Job Card found.`);
  }
  if (!job.passedAt && job.status !== "Ready For Billing" && job.status !== "QC Passed") {
    throw new ValidationError(
      `Cannot ${action} this vehicle: Job has not passed Quality Control yet (current status: "${job.status}").`
    );
  }
}

export function assertInvoicePaidOrCredit(invoice: InvoiceLike | null, totalPaid: number, action = "generate an Outpass for"): asserts invoice is InvoiceLike {
  if (!invoice) {
    throw new ValidationError(`Cannot ${action} this vehicle: no Invoice found.`);
  }
  const invoiceAmount = (invoice.amount || 0) + (invoice.gst || 0) - (invoice.discount || 0);
  const isCreditOrPaid =
    invoice.status === "Approved Credit" ||
    invoice.status === "Paid" ||
    (invoiceAmount > 0 && totalPaid >= invoiceAmount - 1);

  if (!isCreditOrPaid) {
    throw new ValidationError(
      `Cannot ${action} this vehicle: Payment incomplete. Invoiced: ₹${invoiceAmount.toFixed(2)}, Paid: ₹${totalPaid.toFixed(2)}.`
    );
  }
}
