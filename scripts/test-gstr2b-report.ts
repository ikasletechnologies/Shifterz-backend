// GSTR-2B — executable verification for buildGstr2bReport(), the pure
// aggregation function report.service.ts's getGstr2bReport() calls after
// fetching real rows. This is genuinely testable without a live DB because
// the function takes plain data, not a Prisma client — no query, no
// connection, no fabricated "live" result. It does NOT test the DB-fetching
// wrapper itself (getGstLedgerTransactionsInRange, getPurchaseOrderMetadata)
// or anything requiring a real server/database (franchise-scope query
// behavior end-to-end, CSV route reachability, actual GstTransaction rows) —
// those require the VPS stage.
// Run with: npx tsx scripts/test-gstr2b-report.ts
import { buildGstr2bReport, type Gstr2bLedgerRow, type PurchaseOrderMeta } from '../src/modules/report/service/gstr2bAggregation.helper.js';

let pass = 0;
let fail = 0;

function assertEqual(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.log(`FAIL: ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

let seq = 0;
function row(overrides: Partial<Gstr2bLedgerRow>): Gstr2bLedgerRow {
  seq++;
  return {
    documentId: `po-${seq}`,
    documentNumber: `SUP-INV-${seq}`,
    documentDate: new Date('2026-06-15'),
    returnPeriod: '2026-06',
    sellerGstin: '27ABCDE1234F1Z5',
    hsnSac: '8708',
    gstRate: 18,
    taxableValue: 1000,
    cgst: 90,
    sgst: 90,
    igst: 0,
    cess: 0,
    itcEligible: true,
    ...overrides,
  };
}

function meta(overrides: Partial<PurchaseOrderMeta> = {}): PurchaseOrderMeta {
  return { vendorName: 'Test Vendor', stage: 'INVOICED', isDeleted: false, ...overrides };
}

// ─── Basic ────────────────────────────────────────────────────────────

{
  const r = row({ documentId: 'po-a', itcEligible: true });
  const result = buildGstr2bReport([r], new Map([['po-a', meta()]]));
  assertEqual('one eligible PURCHASE -> correct ITC', result.summary.totalEligibleItc, 180);
  assertEqual('one eligible PURCHASE -> zero ineligible ITC', result.summary.totalIneligibleItc, 0);
  assertEqual('eligible document flagged itcEligible:true', result.documents[0]?.itcEligible, true);
}

{
  const r = row({ documentId: 'po-b', itcEligible: false });
  const result = buildGstr2bReport([r], new Map([['po-b', meta()]]));
  assertEqual('one ineligible PURCHASE -> excluded from eligible ITC', result.summary.totalEligibleItc, 0);
  assertEqual('ineligible PURCHASE -> itcAmount is zero on the document itself', result.documents[0]?.itcAmount, 0);
}

{
  const r = row({ documentId: 'po-c', cgst: 90, sgst: 90, igst: 0, itcEligible: true });
  const result = buildGstr2bReport([r], new Map([['po-c', meta()]]));
  assertEqual('CGST+SGST purchase -> ITC = cgst+sgst', result.summary.totalEligibleItc, 180);
}

{
  const r = row({ documentId: 'po-d', cgst: 0, sgst: 0, igst: 180, itcEligible: true });
  const result = buildGstr2bReport([r], new Map([['po-d', meta()]]));
  assertEqual('IGST purchase -> ITC = igst', result.summary.totalEligibleItc, 180);
}

{
  const r = row({ documentId: 'po-e', cgst: 90, sgst: 90, igst: 0, cess: 10, itcEligible: true });
  const result = buildGstr2bReport([r], new Map([['po-e', meta()]]));
  assertEqual('CESS included in ITC total', result.summary.totalEligibleItc, 190);
}

// ─── Multiple documents ─────────────────────────────────────────────────

{
  const rows = [
    row({ documentId: 'po-f', sellerGstin: 'GSTIN-A' }),
    row({ documentId: 'po-g', sellerGstin: 'GSTIN-B' }),
  ];
  const metaMap = new Map([['po-f', meta({ vendorName: 'Vendor A' })], ['po-g', meta({ vendorName: 'Vendor B' })]]);
  const result = buildGstr2bReport(rows, metaMap);
  assertEqual('two different suppliers -> two documents, two distinct vendor names', new Set(result.documents.map((d) => d.vendorName)).size, 2);
  assertEqual('two different suppliers -> totalDocuments = 2', result.summary.totalDocuments, 2);
}

{
  const rows = [
    row({ documentId: 'po-h', gstRate: 18, cgst: 90, sgst: 90 }),
    row({ documentId: 'po-h', gstRate: 5, cgst: 25, sgst: 25 }), // same PurchaseOrder, second rate group
  ];
  const result = buildGstr2bReport(rows, new Map([['po-h', meta()]]));
  assertEqual('one PurchaseOrder with two rate groups -> two ledger rows, one document count', result.summary.totalDocuments, 1);
  assertEqual('two rate groups -> both rows still present', result.documents.length, 2);
}

{
  const rows = [
    row({ documentId: 'po-i', hsnSac: '8708' }),
    row({ documentId: 'po-i', hsnSac: '3926' }),
  ];
  const result = buildGstr2bReport(rows, new Map([['po-i', meta()]]));
  assertEqual('multiple HSNs on one purchase -> both rows present with distinct HSN', new Set(result.documents.map((d) => d.hsnSac)).size, 2);
}

{
  const rows = [
    row({ documentId: 'po-j', returnPeriod: '2026-06' }),
    row({ documentId: 'po-k', returnPeriod: '2026-06' }),
  ];
  const metaMap = new Map([['po-j', meta()], ['po-k', meta()]]);
  const result = buildGstr2bReport(rows, metaMap);
  assertEqual('multiple purchase invoices in the same period -> both counted', result.summary.totalDocuments, 2);
}

// ─── Eligibility ─────────────────────────────────────────────────────────

{
  const rows = [
    row({ documentId: 'po-l', itcEligible: true, cgst: 90, sgst: 90 }),
    row({ documentId: 'po-m', itcEligible: false, cgst: 50, sgst: 50 }),
  ];
  const metaMap = new Map([['po-l', meta()], ['po-m', meta()]]);
  const result = buildGstr2bReport(rows, metaMap);
  assertEqual('eligible + ineligible in same period -> eligible ITC only from eligible row', result.summary.totalEligibleItc, 180);
  assertEqual('eligible + ineligible in same period -> ineligible total from the ineligible row', result.summary.totalIneligibleItc, 100);
}

{
  const rows = [
    row({ documentId: 'po-n', sellerGstin: 'GSTIN-SAME', itcEligible: true, cgst: 90, sgst: 90 }),
    row({ documentId: 'po-o', sellerGstin: 'GSTIN-SAME', itcEligible: false, cgst: 50, sgst: 50 }),
  ];
  const metaMap = new Map([['po-n', meta({ vendorName: 'Same Vendor' })], ['po-o', meta({ vendorName: 'Same Vendor' })]]);
  const result = buildGstr2bReport(rows, metaMap);
  assertEqual('same supplier, eligible and ineligible documents both present, correctly split', {
    eligible: result.summary.totalEligibleItc,
    ineligible: result.summary.totalIneligibleItc,
  }, { eligible: 180, ineligible: 100 });
}

// ─── Cancellation ──────────────────────────────────────────────────────

{
  const r = row({ documentId: 'po-p', itcEligible: true });
  const result = buildGstr2bReport([r], new Map([['po-p', meta({ isDeleted: true })]]));
  assertEqual('cancelled (isDeleted) purchase -> excluded from documents entirely', result.documents.length, 0);
  assertEqual('cancelled purchase -> excluded from eligible ITC', result.summary.totalEligibleItc, 0);
}

{
  // The ledger row itself is passed in unchanged — buildGstr2bReport never
  // mutates or drops it from the input; it's the *report output* that
  // excludes it. This is the "history preserved, active totals exclude it"
  // requirement — provable here as: the row is still in the function's
  // input array after the call (nothing deletes ledger data), only absent
  // from the computed output.
  const r = row({ documentId: 'po-q', itcEligible: true });
  const rowsInput = [r];
  buildGstr2bReport(rowsInput, new Map([['po-q', meta({ isDeleted: true })]]));
  assertEqual('cancelled purchase -> input ledger row array itself is untouched (history preserved)', rowsInput.length, 1);
}

// ─── Historical snapshot ─────────────────────────────────────────────────
// buildGstr2bReport never reads a "current vendor" value — every field it
// emits (supplierGstin, taxableValue, cgst/sgst/igst/cess, gstRate, hsnSac)
// comes from the ledger row itself, frozen at attachment time. vendorName
// comes only from the bulk PurchaseOrder metadata map the caller passes in,
// never from a live Vendor lookup. This is provable structurally: the
// function's signature has no Vendor-shaped input at all.
{
  const r = row({ documentId: 'po-r', sellerGstin: 'GSTIN-AT-ATTACH-TIME' });
  const result = buildGstr2bReport([r], new Map([['po-r', meta({ vendorName: 'Name At Attach Time' })]]));
  assertEqual('supplierGstin comes from the frozen ledger row, not a live vendor lookup', result.documents[0]?.supplierGstin, 'GSTIN-AT-ATTACH-TIME');
  assertEqual('vendorName comes from the passed-in metadata snapshot, not any live source the function itself queries', result.documents[0]?.vendorName, 'Name At Attach Time');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
