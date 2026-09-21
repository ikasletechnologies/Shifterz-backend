// Purchase GST/ITC foundation — smallest safe validation for supplier
// payments, extracted as a pure function purely so it's testable without a
// live DB (mirrors the noteAuthority.helper.ts pattern). Does not redesign
// purchase accounting: still a single paidAmount write, no partial-payment
// history, no new payment states.
export function isValidPaymentAmount(paidAmount: number, totalAmount: number): boolean {
  return paidAmount >= 0 && paidAmount <= totalAmount;
}

export interface CalculatedLine {
  hsnSac: string | null;
  gstRate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

export interface LedgerGroup {
  hsnSac: string | null;
  gstRate: number;
  itcEligible: boolean;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

// Static-review fix — groups GstCalculationService's already-calculated
// per-line output by (rate, HSN, ITC-eligibility) into ledger rows, matching
// the "one ledger row per rate/HSN group" architecture (GST-07) that the
// original one-row-per-input-line implementation violated. Grouping the
// output (not the input) means this never recomputes tax — still exactly
// one calculate() call upstream. ITC eligibility is part of the grouping
// key so two lines at the same rate/HSN but different eligibility are never
// silently merged into one row.
export function groupCalculatedLinesForLedger(
  lines: CalculatedLine[],
  itcEligibleForLine: (index: number) => boolean
): LedgerGroup[] {
  const groups = new Map<string, LedgerGroup>();
  lines.forEach((line, i) => {
    const itcEligible = itcEligibleForLine(i);
    const key = `${line.gstRate}|${line.hsnSac ?? ''}|${itcEligible}`;
    const existing = groups.get(key);
    if (existing) {
      existing.taxableValue += line.taxableAmount;
      existing.cgst += line.cgst;
      existing.sgst += line.sgst;
      existing.igst += line.igst;
      existing.cess += line.cess;
    } else {
      groups.set(key, {
        hsnSac: line.hsnSac,
        gstRate: line.gstRate,
        itcEligible,
        taxableValue: line.taxableAmount,
        cgst: line.cgst,
        sgst: line.sgst,
        igst: line.igst,
        cess: line.cess,
      });
    }
  });
  return Array.from(groups.values());
}
