import { db } from '../../../lib/db.js';
import { ValidationError } from '../../../shared/errors/ValidationError.js';
import { GstCalculationService, type GstCalculationResult, type GstLineItemInput } from './gstCalculation.service.js';

// GST-03 — the DB-aware orchestration layer GST-02 was deliberately kept free
// of. Resolves seller/buyer/rate information from the database, then hands
// off to the pure GstCalculationService for the actual math. This is the
// single place invoice creation/conversion (and, going forward, reports)
// must go through — no other code path should independently resolve or
// recompute GST.
export interface ResolveInvoiceGstInput {
  franchiseId?: string | null;
  jobId?: string | null;
  buyerPhone?: string | null;
  buyerGstin?: string | null;
  buyerState?: string | null;
  /** Only used as the taxable base when the invoice is NOT job-linked. For a job-linked invoice, the job's own services are authoritative — see resolve()'s doc comment. */
  amount: number;
  discount?: number;
  /** Required when no jobId is given — there's no other source for a rate. */
  manualGstRate?: number | null;
  manualHsnSac?: string | null;
}

export class GstInvoiceResolverService {
  private engine = new GstCalculationService();

  // For a job-linked invoice, the taxable amount is the sum of the job's own
  // matched services, NOT `input.amount` — per the locked GST-03 decision,
  // the backend calculates and the frontend only displays; a client-supplied
  // amount for a job-linked invoice is silently superseded by the computed
  // sum rather than trusted or hard-rejected, so an out-of-date frontend
  // display doesn't block billing outright. `input.amount` is only actually
  // used as the taxable base for non-job (manual/walk-in) invoices.
  async resolve(input: ResolveInvoiceGstInput): Promise<GstCalculationResult> {
    const { sellerGstin, sellerState } = await this.resolveSeller(input.franchiseId ?? null);
    const { buyerGstin, buyerState } = await this.resolveBuyer(input);
    const lineItems = input.jobId
      ? await this.resolveLineItemsFromJob(input.jobId, input.franchiseId ?? null)
      : this.resolveManualLineItem(input);

    return this.engine.calculate({
      sellerGstin,
      sellerState,
      buyerGstin,
      buyerState,
      lineItems,
      overallDiscount: input.discount ?? 0,
    });
  }

  private async resolveSeller(franchiseId: string | null): Promise<{ sellerGstin: string | null; sellerState: string }> {
    let sellerGstin: string | null = null;
    let sellerState: string | null = null;

    if (franchiseId) {
      const franchise = await db.franchise.findUnique({ where: { id: franchiseId } });
      if (!franchise) throw new ValidationError(`Franchise ${franchiseId} not found`);
      sellerGstin = franchise.gstNumber ?? null;
      sellerState = franchise.state ?? null;
    }

    if (!sellerState) {
      // HQ-created invoices (no franchise) fall back to the single global
      // company config — Setting.gstin is a required field, deliberately the
      // company-wide default identity.
      const setting = await db.setting.findUnique({ where: { id: 'default' } });
      sellerGstin = sellerGstin ?? setting?.gstin ?? null;
      sellerState = sellerState ?? setting?.state ?? null;
    }

    if (!sellerState) {
      throw new ValidationError(
        "Cannot determine the seller's GST state. Set it on the franchise record, or on the global company settings, before billing."
      );
    }

    return { sellerGstin, sellerState };
  }

  // GST-12 — scoped to the invoice's own franchise whenever it has one, so a
  // phone number shared across two franchises (Customer.phone isn't unique)
  // can't pull another franchise's customer GSTIN/state into this invoice. A
  // franchise-less (HQ-level) invoice keeps the unscoped lookup, matching the
  // existing HQ-unrestricted convention (resolveDataScope).
  private async resolveBuyer(input: ResolveInvoiceGstInput): Promise<{ buyerGstin: string | null; buyerState: string | null }> {
    let buyerGstin = input.buyerGstin ?? null;
    let buyerState = input.buyerState ?? null;

    if ((!buyerGstin || !buyerState) && input.buyerPhone) {
      const customer = await db.customer.findFirst({
        where: { phone: input.buyerPhone, ...(input.franchiseId ? { franchiseId: input.franchiseId } : {}) },
      });
      if (customer) {
        buyerGstin = buyerGstin ?? customer.gstNumber ?? null;
        buyerState = buyerState ?? customer.state ?? null;
      }
    }

    return { buyerGstin, buyerState };
  }

  // Matches each Job.services entry (an unstructured { name, price, qty }[]
  // JSON array — InvoiceLine doesn't exist yet, that's GST-04) against the
  // Service catalog by name, then groups by (rate, hsnSac) so a job with
  // services at different GST rates still gets the correct split, without
  // pre-building GST-04's full per-line structure.
  private async resolveLineItemsFromJob(jobId: string, franchiseId: string | null): Promise<GstLineItemInput[]> {
    const job = await db.job.findFirst({ where: { id: jobId, isDeleted: false, ...(franchiseId ? { franchiseId } : {}) } });
    if (!job) throw new ValidationError(`Job ${jobId} not found`);

    const rawServices: any[] = Array.isArray(job.services) ? (job.services as any[]) : [];
    if (rawServices.length === 0) {
      throw new ValidationError(`Job ${jobId} has no recorded services to calculate GST from.`);
    }

    type Group = { gstRate: number; hsnSac: string | null; taxApplicable: boolean; amount: number };
    const groups = new Map<string, Group>();

    for (const item of rawServices) {
      const name = item?.name;
      if (!name || typeof name !== 'string') {
        throw new ValidationError(`Job ${jobId} has a service line item missing a name; cannot resolve its GST rate.`);
      }
      const service = await db.service.findFirst({ where: { name, isDeleted: false } });
      if (!service) {
        throw new ValidationError(
          `Service "${name}" on job ${jobId} was not found in the service catalog — cannot resolve its GST rate. Add it to the Service catalog or correct the job's service list before billing.`
        );
      }

      const qty = Number(item.qty ?? 1);
      const price = Number(item.price ?? 0);
      const lineAmount = price * qty;
      const key = `${service.gst}|${service.hsnSac ?? ''}|${service.taxApplicable}`;

      const existing = groups.get(key);
      if (existing) {
        existing.amount += lineAmount;
      } else {
        groups.set(key, { gstRate: service.gst, hsnSac: service.hsnSac ?? null, taxApplicable: service.taxApplicable, amount: lineAmount });
      }
    }

    return Array.from(groups.values()).map((g) => ({
      unitPrice: g.amount,
      quantity: 1,
      gstRate: g.gstRate,
      hsnSac: g.hsnSac,
      taxApplicable: g.taxApplicable,
    }));
  }

  private resolveManualLineItem(input: ResolveInvoiceGstInput): GstLineItemInput[] {
    if (input.manualGstRate === undefined || input.manualGstRate === null) {
      throw new ValidationError('A GST rate must be specified for an invoice that is not linked to a job.');
    }
    return [{
      unitPrice: input.amount,
      quantity: 1,
      gstRate: input.manualGstRate,
      hsnSac: input.manualHsnSac ?? null,
    }];
  }
}
