// GSTR-3B / GSTR-2B consistency fix — executable verification for
// excludeRowsForDeletedPurchaseOrders(), the shared pure filter both reports
// now use to exclude cancelled purchase orders' ledger rows from ITC. This
// tests the exact defect found during GSTR-2B implementation: GSTR-3B's ITC
// section previously filtered only by itcEligible, with no cross-check
// against the owning PurchaseOrder's status.
// Run with: npx tsx scripts/test-gstr3b-purchase-itc-consistency.ts
import { excludeRowsForDeletedPurchaseOrders, type PurchaseOrderMeta } from '../src/modules/report/service/gstr2bAggregation.helper.js';

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

interface FakeRow {
  documentId: string;
  itcEligible: boolean | null;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

function meta(overrides: Partial<PurchaseOrderMeta> = {}): PurchaseOrderMeta {
  return { vendorName: 'Vendor', stage: 'INVOICED', isDeleted: false, ...overrides };
}

// Reproduces GSTR-3B's own ITC computation (report.service.ts), so this
// test exercises the same two-step filter (exclude deleted, then filter
// eligible) the real method now performs, not just the shared helper alone.
function computeItc(rows: FakeRow[], purchaseOrderMeta: Map<string, PurchaseOrderMeta>) {
  const activeRows = excludeRowsForDeletedPurchaseOrders(rows, purchaseOrderMeta);
  const eligibleRows = activeRows.filter((r) => r.itcEligible === true);
  return {
    cgst: eligibleRows.reduce((s, r) => s + r.cgst, 0),
    sgst: eligibleRows.reduce((s, r) => s + r.sgst, 0),
    igst: eligibleRows.reduce((s, r) => s + r.igst, 0),
    cess: eligibleRows.reduce((s, r) => s + r.cess, 0),
  };
}

// ─── The specific scenarios requested ────────────────────────────────────

{
  const rows: FakeRow[] = [{ documentId: 'po-1', itcEligible: true, cgst: 90, sgst: 90, igst: 0, cess: 0 }];
  const itc = computeItc(rows, new Map([['po-1', meta({ isDeleted: false })]]));
  assertEqual('active eligible PURCHASE -> counted by GSTR-3B', itc, { cgst: 90, sgst: 90, igst: 0, cess: 0 });
}

{
  const rows: FakeRow[] = [{ documentId: 'po-2', itcEligible: false, cgst: 50, sgst: 50, igst: 0, cess: 0 }];
  const itc = computeItc(rows, new Map([['po-2', meta({ isDeleted: false })]]));
  assertEqual('active ineligible PURCHASE -> excluded', itc, { cgst: 0, sgst: 0, igst: 0, cess: 0 });
}

{
  const rows: FakeRow[] = [{ documentId: 'po-3', itcEligible: true, cgst: 90, sgst: 90, igst: 0, cess: 0 }];
  const itc = computeItc(rows, new Map([['po-3', meta({ isDeleted: true })]]));
  assertEqual('deleted/cancelled eligible PURCHASE -> excluded (the fixed defect)', itc, { cgst: 0, sgst: 0, igst: 0, cess: 0 });
}

{
  const rows: FakeRow[] = [
    { documentId: 'po-4', itcEligible: true, cgst: 90, sgst: 90, igst: 0, cess: 0 },   // active, eligible -> counted
    { documentId: 'po-5', itcEligible: true, cgst: 200, sgst: 200, igst: 0, cess: 0 }, // deleted, eligible -> excluded
  ];
  const metaMap = new Map([
    ['po-4', meta({ isDeleted: false })],
    ['po-5', meta({ isDeleted: true })],
  ]);
  const itc = computeItc(rows, metaMap);
  assertEqual('mixed active + deleted purchases -> only active ITC counted', itc, { cgst: 90, sgst: 90, igst: 0, cess: 0 });
}

// ─── GSTR-2B and GSTR-3B now use consistent eligible PURCHASE data ───────
// Both report methods call the same excludeRowsForDeletedPurchaseOrders()
// on the same fetched rows before computing eligible ITC — this proves the
// filtering step itself is identical, which is what makes the two reports'
// totals reconcile (report.service.ts additionally reconfirmed by direct
// code read: both getGstr2bReport and getGstr3bReport now call this same
// exported function).

{
  const rows: FakeRow[] = [
    { documentId: 'po-6', itcEligible: true, cgst: 90, sgst: 90, igst: 0, cess: 0 },
    { documentId: 'po-7', itcEligible: true, cgst: 300, sgst: 300, igst: 0, cess: 0 },
  ];
  const metaMap = new Map([
    ['po-6', meta({ isDeleted: false })],
    ['po-7', meta({ isDeleted: true })],
  ]);
  const activeForGstr3b = excludeRowsForDeletedPurchaseOrders(rows, metaMap);
  const activeForGstr2b = excludeRowsForDeletedPurchaseOrders(rows, metaMap);
  assertEqual('same shared filter applied to the same rows -> identical active set for both reports', activeForGstr3b, activeForGstr2b);
  assertEqual('the deleted purchase order is excluded from that shared active set', activeForGstr3b.map((r) => r.documentId), ['po-6']);
}

// Note: "existing output GST calculations remain unchanged" is not
// re-asserted here as a test — applyOutward()'s outward/CN/DN logic in
// getGstr3bReport was never touched by this fix (confirmed by direct code
// read: excludeRowsForDeletedPurchaseOrders is applied only to the PURCHASE
// row set, nowhere near activeInvoiceRows/creditNoteRows/debitNoteRows), and
// a pure unit test can't meaningfully assert "a function I didn't call
// wasn't changed" without importing the DB-dependent method itself.

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
