// GST CN/DN — executable verification for the pure logic in
// noteAuthority.helper.ts, plus a structural check that the create-note
// validation schemas cannot be used to smuggle client-supplied tax figures
// into the service. This does NOT test database behavior (note creation,
// ledger rows, transaction atomicity, franchise isolation via real queries,
// cancelled-note exclusion) — there is no live database connection in this
// sandbox; those require the VPS stage, same as every other DB-touching
// piece of this project.
// Run with: npx tsx scripts/test-gst-note-authority.ts
import { assertIssuerAuthority, currentFyPrefix } from '../src/modules/gst/service/noteAuthority.helper.js';
import { createCreditNoteSchema } from '../src/modules/gst/validation/creditNote.validation.js';
import { createDebitNoteSchema } from '../src/modules/gst/validation/debitNote.validation.js';

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

function assertDoesNotThrow(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`PASS: ${name}`);
  } catch (e) {
    fail++;
    console.log(`FAIL: ${name} — unexpected throw: ${e}`);
  }
}

// ─── assertIssuerAuthority ──────────────────────────────────────────────

for (const role of ['SUPER_ADMIN', 'HQ_USER', 'FRANCHISE_ADMIN']) {
  assertDoesNotThrow(`${role} may issue/cancel notes`, () => assertIssuerAuthority({ role }, 'credit notes'));
}

for (const role of ['BRANCH_MANAGER', 'TECHNICIAN', 'SERVICE_ADVISOR', 'BILLING_EXECUTIVE', 'UNKNOWN_ROLE']) {
  assertThrows(`${role} cannot issue/cancel notes`, () => assertIssuerAuthority({ role }, 'credit notes'));
}

assertThrows('no actor at all -> denied', () => assertIssuerAuthority(undefined, 'credit notes'));
assertThrows('actor with no role -> denied', () => assertIssuerAuthority({}, 'credit notes'));

// ─── currentFyPrefix ────────────────────────────────────────────────────

// April 2026 -> FY 2026-27
assertEqual('April date -> new FY starts', currentFyPrefix('CN', new Date(2026, 3, 15)), 'CN-26-27-');
// March 2026 -> still FY 2025-26 (Apr-Mar year)
assertEqual('March date -> previous FY', currentFyPrefix('CN', new Date(2026, 2, 15)), 'CN-25-26-');
// Debit note prefix uses the same FY logic with a different base.
assertEqual('DN prefix, same FY math', currentFyPrefix('DN', new Date(2026, 3, 15)), 'DN-26-27-');

// ─── Client cannot spoof GST totals ─────────────────────────────────────
// Zod strips unrecognized keys by default (no .passthrough() in either
// schema) — a client-supplied cgst/sgst/igst/cess/totalTax/totalAmount can
// never reach GstCreditNoteService/GstDebitNoteService at all; the service
// only ever sees whatever GstCalculationService itself computed.

{
  const spoofed = {
    body: {
      originalInvoiceId: 'inv-1',
      reason: 'test',
      lines: [{ description: 'Item', rate: 100, gstRate: 18 }],
      // attempted spoof — none of these are declared fields on the schema
      cgst: 999999,
      sgst: 999999,
      igst: 999999,
      cess: 999999,
      totalTax: 999999,
      totalAmount: 999999,
    },
  };
  const parsed = createCreditNoteSchema.parse(spoofed);
  const parsedKeys = Object.keys(parsed.body);
  assertEqual('CN schema strips client-supplied tax fields', parsedKeys.some((k) => ['cgst', 'sgst', 'igst', 'cess', 'totalTax', 'totalAmount'].includes(k)), false);
}

{
  const spoofed = {
    body: {
      originalInvoiceId: 'inv-1',
      reason: 'test',
      lines: [{ description: 'Item', rate: 100, gstRate: 18 }],
      cgst: 999999,
      totalAmount: 999999,
    },
  };
  const parsed = createDebitNoteSchema.parse(spoofed);
  const parsedKeys = Object.keys(parsed.body);
  assertEqual('DN schema strips client-supplied tax fields', parsedKeys.some((k) => ['cgst', 'totalAmount'].includes(k)), false);
}

// ─── Validation basics ──────────────────────────────────────────────────

assertThrows('CN schema rejects empty lines array', () => {
  createCreditNoteSchema.parse({ body: { originalInvoiceId: 'inv-1', reason: 'test', lines: [] } });
});

assertThrows('CN schema rejects missing reason', () => {
  createCreditNoteSchema.parse({ body: { originalInvoiceId: 'inv-1', reason: '', lines: [{ description: 'x', rate: 1, gstRate: 18 }] } });
});

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
