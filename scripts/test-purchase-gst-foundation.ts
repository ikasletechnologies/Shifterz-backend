// Purchase GST/ITC foundation — executable verification for the pure logic
// added in this phase, plus a structural check that GET /vendors and
// GET /purchases now carry a role-check middleware layer. This does NOT
// test database behavior (vendor/purchase creation, PurchaseOrderLine rows,
// PURCHASE GstTransaction rows, transaction atomicity, GSTR-3B reading real
// ITC data, actual 403 responses from a running server) — there is no live
// database connection in this sandbox; those require the VPS stage.
// Run with: npx tsx scripts/test-purchase-gst-foundation.ts
import { isValidPaymentAmount, groupCalculatedLinesForLedger, type CalculatedLine } from '../src/modules/gst/service/purchaseValidation.helper.js';
import { attachPurchaseInvoiceSchema } from '../src/modules/gst/validation/purchaseInvoice.validation.js';
import { hqRouter } from '../src/routes/hq.js';

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

function assertThrows(name: string, fn: () => void) {
  try {
    fn();
    fail++;
    console.log(`FAIL: ${name} — expected a throw, none occurred`);
  } catch {
    pass++;
    console.log(`PASS: ${name}`);
  }
}

// ─── isValidPaymentAmount ───────────────────────────────────────────────

assertEqual('paidAmount within range is valid', isValidPaymentAmount(500, 1000), true);
assertEqual('paidAmount equal to total is valid', isValidPaymentAmount(1000, 1000), true);
assertEqual('paidAmount of zero is valid', isValidPaymentAmount(0, 1000), true);
assertEqual('paidAmount exceeding total is invalid', isValidPaymentAmount(1001, 1000), false);
assertEqual('negative paidAmount is invalid', isValidPaymentAmount(-1, 1000), false);

// ─── groupCalculatedLinesForLedger (static-review fix) ──────────────────
// Verifies the "one ledger row per rate/HSN group" requirement the original
// implementation violated (one row per input line instead).

function line(hsnSac: string, gstRate: number, taxableAmount: number): CalculatedLine {
  const cgst = gstRate > 0 ? Math.round(taxableAmount * (gstRate / 2)) / 100 : 0;
  return { hsnSac, gstRate, taxableAmount, cgst, sgst: cgst, igst: 0, cess: 0 };
}

{
  const lines = [line('1234', 18, 100), line('1234', 18, 200)];
  const groups = groupCalculatedLinesForLedger(lines, () => true);
  assertEqual('two lines, same rate+HSN, same eligibility -> one group', groups.length, 1);
  assertEqual('grouped taxableValue sums both lines', groups[0]?.taxableValue, 300);
}

{
  const lines = [line('1234', 18, 100), line('5678', 18, 200)];
  const groups = groupCalculatedLinesForLedger(lines, () => true);
  assertEqual('same rate, different HSN -> two groups', groups.length, 2);
}

{
  const lines = [line('1234', 18, 100), line('1234', 5, 200)];
  const groups = groupCalculatedLinesForLedger(lines, () => true);
  assertEqual('same HSN, different rate -> two groups', groups.length, 2);
}

{
  const lines = [line('1234', 18, 100), line('1234', 18, 200)];
  const groups = groupCalculatedLinesForLedger(lines, (i) => i === 0);
  assertEqual('same rate+HSN, different ITC eligibility -> two groups (never silently merged)', groups.length, 2);
}

{
  const lines = [line('1234', 18, 100)];
  const groups = groupCalculatedLinesForLedger(lines, () => true);
  assertEqual('single line -> one group, unaffected by grouping', groups.length, 1);
}

// ─── Client cannot supply authoritative purchase GST amounts ───────────
// Same zod-strip-unknown-keys guarantee as the CN/DN schemas — a client
// cannot smuggle cgst/sgst/igst/cess/taxableValue into the attach-invoice
// payload; the service only ever persists what GstCalculationService itself
// computed from the submitted line rate/quantity/gstRate.

{
  const spoofed = {
    body: {
      invoiceNumber: 'SUP-INV-1',
      itcEligible: true,
      lines: [{ description: 'Item', rate: 100, gstRate: 18 }],
      cgst: 999999,
      sgst: 999999,
      igst: 999999,
      cess: 999999,
      taxableValue: 999999,
    },
  };
  const parsed = attachPurchaseInvoiceSchema.parse(spoofed);
  const parsedKeys = Object.keys(parsed.body);
  assertEqual(
    'purchase invoice schema strips client-supplied tax fields',
    parsedKeys.some((k) => ['cgst', 'sgst', 'igst', 'cess', 'taxableValue'].includes(k)),
    false
  );
}

assertThrows('purchase invoice schema rejects empty lines array', () => {
  attachPurchaseInvoiceSchema.parse({ body: { invoiceNumber: 'X', itcEligible: false, lines: [] } });
});

assertThrows('purchase invoice schema requires itcEligible to be an explicit boolean', () => {
  attachPurchaseInvoiceSchema.parse({ body: { invoiceNumber: 'X', lines: [{ description: 'x', rate: 1, gstRate: 18 }] } });
});

// ─── Structural: GET /vendors and GET /purchases now carry a role check ──
// A protected route has [roleCheckMiddleware, handler] on its stack; an
// unprotected one has only [handler]. This can't prove the role check
// actually rejects an unauthorized request (needs a live server), but it
// does prove the middleware is registered on these exact routes, not just
// present somewhere else in the file.

function layerCountForRoute(method: string, path: string): number | null {
  const layer = (hqRouter as any).stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  return layer ? layer.route.stack.length : null;
}

assertEqual('GET /vendors has more than one middleware layer (role-gated)', (layerCountForRoute('get', '/vendors') ?? 0) > 1, true);
assertEqual('GET /purchases has more than one middleware layer (role-gated)', (layerCountForRoute('get', '/purchases') ?? 0) > 1, true);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
