import { ValidationError } from '../../../shared/errors/ValidationError.js';

// GST-02 — the single canonical GST calculation engine (per GST-01/GST-02
// review: "not another parallel GST calculation in report.service.ts or
// hq.ts"). Deliberately pure: no DB access, no Prisma imports. Everything
// this needs is passed in by the caller (GST-03 will be the DB-aware
// orchestration layer that loads Franchise/Customer/Service rows and calls
// this). Keeping it pure means it can be unit-tested exhaustively with zero
// database dependency, the same way resolveActionPermissionsPure() is.
//
// This replaces the previous, incorrect logic that existed only in
// report.service.ts's GST summary:
//   cgst = gst / 2; sgst = gst / 2; igst = 0;
// which was applied unconditionally, regardless of seller/buyer state —
// meaning every invoice was always treated as intra-state and IGST was
// never actually computed. That defect must not be reintroduced anywhere
// once GST-03 wires invoice creation through this engine.

const ENGINE_VERSION = 'gst-calc-v1';

export type SupplyType = 'B2B' | 'B2C';

export interface GstLineItemInput {
  description?: string;
  quantity?: number;
  unitPrice: number;
  /** Absolute discount amount for this line (not a percentage). */
  discount?: number;
  hsnSac?: string | null;
  /** Percentage, e.g. 18 for 18%. */
  gstRate: number;
  /** Percentage, e.g. 1 for 1% cess. Omit or 0 if not applicable. */
  cessRate?: number;
  /** Defaults to true. false => this line is zero-rated/exempt (no tax charged, still shown as taxable value at 0 tax). */
  taxApplicable?: boolean;
}

export interface GstCalculationInput {
  sellerGstin?: string | null;
  sellerState: string;
  buyerGstin?: string | null;
  /** The buyer's registered/billing state. Used to derive place of supply unless placeOfSupply is given explicitly. */
  buyerState?: string | null;
  /** Explicit place-of-supply override. If omitted, derived from buyerState. */
  placeOfSupply?: string | null;
  lineItems: GstLineItemInput[];
  /** Additional invoice-level discount, applied proportionally across lines by taxable value share. */
  overallDiscount?: number;
}

export interface GstLineItemResult {
  description?: string;
  hsnSac: string | null;
  gstRate: number;
  cessRate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
  lineTotal: number;
}

export interface GstCalculationResult {
  supplyType: SupplyType;
  placeOfSupply: string;
  isIntraState: boolean;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  totalTax: number;
  grandTotal: number;
  lines: GstLineItemResult[];
  meta: {
    sellerGstin: string | null;
    sellerState: string;
    buyerGstin: string | null;
    buyerState: string | null;
    engineVersion: string;
    calculatedAt: string;
  };
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

const normalizeState = (state: string): string => state.trim().toLowerCase();

export class GstCalculationService {
  calculate(input: GstCalculationInput): GstCalculationResult {
    if (!input.sellerState || !input.sellerState.trim()) {
      throw new ValidationError('GST calculation requires the seller\'s state to determine intra-state vs inter-state supply.');
    }

    // Place of supply: explicit override, else the buyer's state. Per GST-01's
    // review ("customer state already exists; use it for place-of-supply
    // determination"), this is a deliberate simplification appropriate for a
    // straightforward services business — not the full multi-category
    // place-of-supply rule set GST law has for e.g. transportation or
    // immovable property, which this system doesn't need.
    const placeOfSupply = (input.placeOfSupply ?? input.buyerState ?? '').trim();
    if (!placeOfSupply) {
      // Fail closed, not silently intra-state — an unresolved place of supply
      // is exactly the kind of missing information GST-18's validation
      // philosophy says must reject the invoice, not guess at it.
      throw new ValidationError(
        'GST calculation requires a place of supply (or the buyer\'s state to derive it from) — cannot determine CGST+SGST vs IGST without it.'
      );
    }

    if (!input.lineItems || input.lineItems.length === 0) {
      throw new ValidationError('GST calculation requires at least one line item.');
    }

    for (const line of input.lineItems) {
      if (line.unitPrice < 0) throw new ValidationError('Line item unit price cannot be negative.');
      if (line.gstRate < 0) throw new ValidationError('Line item GST rate cannot be negative.');
      if (line.cessRate !== undefined && line.cessRate < 0) throw new ValidationError('Line item cess rate cannot be negative.');
    }

    // The one rule this whole engine exists to get right: compare seller
    // state to place of supply, not a hardcoded assumption.
    const isIntraState = normalizeState(input.sellerState) === normalizeState(placeOfSupply);

    // B2B vs B2C is determined by whether the buyer has a GSTIN — this is the
    // standard GST rule, not a guess: B2B invoices carry the buyer's GSTIN,
    // B2C invoices don't.
    const supplyType: SupplyType = input.buyerGstin && input.buyerGstin.trim() ? 'B2B' : 'B2C';

    // Proportionally distribute the overall (invoice-level) discount across
    // lines by each line's share of the pre-discount subtotal, so per-line
    // taxable value stays consistent with the invoice total.
    const preDiscountLineAmounts = input.lineItems.map((line) => {
      const qty = line.quantity ?? 1;
      const gross = line.unitPrice * qty;
      const lineDiscount = line.discount ?? 0;
      return Math.max(0, gross - lineDiscount);
    });
    const subtotalAfterLineDiscounts = preDiscountLineAmounts.reduce((sum, v) => sum + v, 0);
    const overallDiscount = input.overallDiscount ?? 0;

    const lines: GstLineItemResult[] = input.lineItems.map((line, i) => {
      const baseAmount = preDiscountLineAmounts[i] ?? 0;
      const proportionalShare = subtotalAfterLineDiscounts > 0 ? baseAmount / subtotalAfterLineDiscounts : 0;
      const allocatedOverallDiscount = overallDiscount * proportionalShare;
      const taxableAmount = Math.max(0, baseAmount - allocatedOverallDiscount);

      const taxApplicable = line.taxApplicable ?? true;
      const rate = taxApplicable ? line.gstRate : 0;
      const cessRate = taxApplicable ? (line.cessRate ?? 0) : 0;

      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      if (isIntraState) {
        cgst = round2(taxableAmount * (rate / 2) / 100);
        sgst = round2(taxableAmount * (rate / 2) / 100);
      } else {
        igst = round2(taxableAmount * rate / 100);
      }

      const cess = round2(taxableAmount * cessRate / 100);
      const totalTax = round2(cgst + sgst + igst + cess);
      const roundedTaxable = round2(taxableAmount);

      return {
        description: line.description,
        hsnSac: line.hsnSac ?? null,
        gstRate: line.gstRate,
        cessRate: line.cessRate ?? 0,
        taxableAmount: roundedTaxable,
        cgst,
        sgst,
        igst,
        cess,
        totalTax,
        lineTotal: round2(roundedTaxable + totalTax),
      };
    });

    const aggregate = lines.reduce(
      (acc, line) => ({
        taxableAmount: acc.taxableAmount + line.taxableAmount,
        cgst: acc.cgst + line.cgst,
        sgst: acc.sgst + line.sgst,
        igst: acc.igst + line.igst,
        cess: acc.cess + line.cess,
      }),
      { taxableAmount: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 }
    );

    const taxableAmount = round2(aggregate.taxableAmount);
    const cgst = round2(aggregate.cgst);
    const sgst = round2(aggregate.sgst);
    const igst = round2(aggregate.igst);
    const cess = round2(aggregate.cess);
    const totalTax = round2(cgst + sgst + igst + cess);
    const grandTotal = round2(taxableAmount + totalTax);

    return {
      supplyType,
      placeOfSupply,
      isIntraState,
      taxableAmount,
      cgst,
      sgst,
      igst,
      cess,
      totalTax,
      grandTotal,
      lines,
      meta: {
        sellerGstin: input.sellerGstin ?? null,
        sellerState: input.sellerState,
        buyerGstin: input.buyerGstin ?? null,
        buyerState: input.buyerState ?? null,
        engineVersion: ENGINE_VERSION,
        calculatedAt: new Date().toISOString(),
      },
    };
  }
}
