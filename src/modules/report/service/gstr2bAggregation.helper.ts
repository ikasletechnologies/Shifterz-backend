// GSTR-2B — pure aggregation over already-fetched GstTransaction(PURCHASE)
// rows + a bulk PurchaseOrder metadata lookup. Deliberately takes plain data
// rather than querying the DB itself, so it's unit-testable with zero
// database dependency — same separation as GstCalculationService and this
// session's groupCalculatedLinesForLedger(). Never recalculates GST; every
// figure here is read directly from already-persisted ledger fields.
export interface Gstr2bLedgerRow {
  documentId: string;
  documentNumber: string;
  documentDate: Date;
  returnPeriod: string;
  sellerGstin: string | null;
  hsnSac: string | null;
  gstRate: number | null;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  itcEligible: boolean | null;
}

export interface PurchaseOrderMeta {
  vendorName: string;
  stage: string;
  isDeleted: boolean;
}

export interface Gstr2bDocument {
  purchaseOrderId: string;
  vendorName: string | null;
  supplierGstin: string | null;
  invoiceNumber: string;
  invoiceDate: Date;
  returnPeriod: string;
  hsnSac: string | null;
  gstRate: number | null;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  itcEligible: boolean;
  itcAmount: number;
  status: string;
}

export interface Gstr2bSummary {
  totalDocuments: number;
  totalTaxableValue: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalCess: number;
  totalEligibleItc: number;
  totalIneligibleItc: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Shared "live status cross-check, not a ledger resync" filter — same
// pattern already used for cancelled invoices/CN/DN elsewhere in this
// report module. Generic over any row shape carrying a documentId so it can
// be reused by both GSTR-2B (here) and GSTR-3B's ITC section
// (report.service.ts), which previously lacked this exclusion — that
// inconsistency was the exact defect this fix closes.
export function excludeRowsForDeletedPurchaseOrders<T extends { documentId: string }>(
  rows: T[],
  purchaseOrderMeta: Map<string, PurchaseOrderMeta>
): T[] {
  return rows.filter((r) => {
    const meta = purchaseOrderMeta.get(r.documentId);
    return meta !== undefined && !meta.isDeleted;
  });
}

// itcEligible is read verbatim from the ledger, never inferred from
// GSTIN/rate/HSN/vendor/amount — the explicit persisted decision remains
// authoritative, per the locked scope of this phase.
export function buildGstr2bReport(
  rows: Gstr2bLedgerRow[],
  purchaseOrderMeta: Map<string, PurchaseOrderMeta>
): { summary: Gstr2bSummary; documents: Gstr2bDocument[] } {
  const activeRows = excludeRowsForDeletedPurchaseOrders(rows, purchaseOrderMeta);

  const documents: Gstr2bDocument[] = activeRows.map((r) => {
    const meta = purchaseOrderMeta.get(r.documentId);
    const itcEligible = r.itcEligible === true;
    const itcAmount = itcEligible ? round2(r.cgst + r.sgst + r.igst + r.cess) : 0;
    return {
      purchaseOrderId: r.documentId,
      vendorName: meta?.vendorName ?? null,
      supplierGstin: r.sellerGstin,
      invoiceNumber: r.documentNumber,
      invoiceDate: r.documentDate,
      returnPeriod: r.returnPeriod,
      hsnSac: r.hsnSac,
      gstRate: r.gstRate,
      taxableValue: round2(r.taxableValue),
      cgst: round2(r.cgst),
      sgst: round2(r.sgst),
      igst: round2(r.igst),
      cess: round2(r.cess),
      itcEligible,
      itcAmount,
      status: meta?.stage ?? 'Unknown',
    };
  });

  // Distinct purchase documents, not raw row count — a multi-rate/HSN
  // purchase invoice produces multiple ledger rows for the same
  // PurchaseOrder (GST-07's grouping), same lesson already applied to
  // GSTR-1's invoiceCount.
  const totalDocuments = new Set(documents.map((d) => d.purchaseOrderId)).size;

  const eligible = documents.filter((d) => d.itcEligible);
  const ineligible = documents.filter((d) => !d.itcEligible);

  return {
    summary: {
      totalDocuments,
      totalTaxableValue: round2(documents.reduce((s, d) => s + d.taxableValue, 0)),
      totalCgst: round2(documents.reduce((s, d) => s + d.cgst, 0)),
      totalSgst: round2(documents.reduce((s, d) => s + d.sgst, 0)),
      totalIgst: round2(documents.reduce((s, d) => s + d.igst, 0)),
      totalCess: round2(documents.reduce((s, d) => s + d.cess, 0)),
      totalEligibleItc: round2(eligible.reduce((s, d) => s + d.itcAmount, 0)),
      totalIneligibleItc: round2(ineligible.reduce((s, d) => s + d.cgst + d.sgst + d.igst + d.cess, 0)),
    },
    documents,
  };
}
