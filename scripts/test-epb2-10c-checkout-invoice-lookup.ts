// EPB 2.10 re-verification finding — checkout() invoice-lookup ordering.
//
// VehicleCheckinService.checkout() previously resolved the invoice to
// gate-check by VEHICLE REGISTRATION STRING first, falling back to
// jobId only if that found nothing. For a repeat vehicle whose earlier,
// already-paid visit left behind a fully-paid invoice, this could
// silently satisfy the payment gate for a CURRENT, unbilled visit using
// that stale, unrelated invoice — the vehicle string matches, but the
// invoice has nothing to do with the job actually being checked out.
//
// Fix: resolve by `Invoice.jobId === car.jobCardId` FIRST (a direct,
// reliable reference — car.jobCardId is set at check-in time and
// Invoice.jobId is populated at billing time). The vehicle-string
// fallback is now scoped to `jobId: null` — it only exists to find
// genuinely legacy invoices that predate Invoice.jobId being populated,
// and must never cross-match a DIFFERENT job's invoice for the same
// vehicle.
//
// This test drives the real VehicleCheckinService.checkout() (the actual
// method, not a reimplementation) with an injected fake repository and
// monkey-patched db.job/invoice/payment calls — same technique
// scripts/test-epb2-13-audit-gaps.ts already uses for db.auditLog.create.
// No live database connection in this sandbox — see every other
// scripts/test-epb2-*.ts file's header for the same limitation. A real
// end-to-end run against a live database remains LIVE VERIFICATION
// PENDING and is not implied by this file passing.
//
// Run with: npx tsx scripts/test-epb2-10c-checkout-invoice-lookup.ts
import fs from 'node:fs';
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { db } from '../src/lib/db.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}
async function assertRejectsWith(name: string, fn: () => Promise<unknown>, messageIncludes: string) {
  try {
    await fn();
    fail++; console.log(`FAIL: ${name} — expected a rejection containing "${messageIncludes}", but it resolved`);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg.includes(messageIncludes)) { pass++; console.log(`PASS: ${name}`); }
    else { fail++; console.log(`FAIL: ${name} — rejected, but with unexpected message: ${msg}`); }
  }
}

// ── Fake Prisma-shaped invoice store — filters like the real `where`
// clauses this method actually issues (jobId exact-or-null, vehicle
// exact, isDeleted, status.not), sorted by createdAt desc, matching
// findFirst's contract. ──────────────────────────────────────────────
function fakeInvoiceFindFirst(invoices: any[]) {
  return async (args: any) => {
    const where = args?.where ?? {};
    const matches = invoices.filter((inv) => {
      if ('jobId' in where && inv.jobId !== where.jobId) return false;
      if ('vehicle' in where && inv.vehicle !== where.vehicle) return false;
      if (where.isDeleted !== undefined && Boolean(inv.isDeleted) !== where.isDeleted) return false;
      if (where.status?.not !== undefined && inv.status === where.status.not) return false;
      return true;
    });
    matches.sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0));
    return matches[0] ?? null;
  };
}

function installFakes(opts: {
  car: any;
  job: any;
  invoices: any[];
  payments?: any[];
  outpass?: any | null;
}) {
  const originals = {
    jobFindUnique: db.job.findUnique.bind(db.job),
    invoiceFindFirst: db.invoice.findFirst.bind(db.invoice),
    paymentFindMany: db.payment.findMany.bind(db.payment),
    outPassFindFirst: db.outPass.findFirst.bind(db.outPass),
  };
  (db.job as any).findUnique = async () => opts.job;
  (db.invoice as any).findFirst = fakeInvoiceFindFirst(opts.invoices);
  (db.payment as any).findMany = async () => opts.payments ?? [];
  (db.outPass as any).findFirst = async () => opts.outpass ?? null;

  const fakeRepository = { findById: async () => opts.car } as any;
  const service = new VehicleCheckinService(fakeRepository);

  const restore = () => {
    (db.job as any).findUnique = originals.jobFindUnique;
    (db.invoice as any).findFirst = originals.invoiceFindFirst;
    (db.payment as any).findMany = originals.paymentFindMany;
    (db.outPass as any).findFirst = originals.outPassFindFirst;
  };
  return { service, restore };
}

const CAR_CURRENT_JOB = { id: 'CAR1', vehicle: 'TN01AB1234', jobCardId: 'J2' };
const QC_PASSED_JOB = { status: 'Ready For Billing', passedAt: new Date() };

// ═══════════════════════════════════════════════════════════════════════
// The three requested scenarios
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- Scenario: previous paid invoice + same vehicle, current job has no invoice ---');

await (async () => {
  const staleInvoice = {
    id: 'INV-OLD', jobId: 'J1', vehicle: 'TN01AB1234',
    isDeleted: false, status: 'Paid', amount: 5000, gst: 900, discount: 0,
    createdAt: new Date('2026-01-01'),
  };
  const { service, restore } = installFakes({
    car: CAR_CURRENT_JOB,
    job: QC_PASSED_JOB,
    invoices: [staleInvoice],
  });
  await assertRejectsWith(
    'checkout FAILS — must not use the previous visit\'s invoice to satisfy the current visit\'s payment gate',
    () => service.checkout('CAR1', {} as any),
    'no Invoice found'
  );
  restore();
})();

console.log('\n--- Scenario: current job genuinely has its own (unpaid) invoice ---');

await (async () => {
  const currentInvoice = {
    id: 'INV-CUR', jobId: 'J2', vehicle: 'TN01AB1234',
    isDeleted: false, status: 'Issued', amount: 5000, gst: 900, discount: 0,
    createdAt: new Date(),
  };
  const staleInvoice = {
    id: 'INV-OLD', jobId: 'J1', vehicle: 'TN01AB1234',
    isDeleted: false, status: 'Paid', amount: 5000, gst: 900, discount: 0,
    createdAt: new Date('2026-01-01'),
  };
  const { service, restore } = installFakes({
    car: CAR_CURRENT_JOB,
    job: QC_PASSED_JOB,
    invoices: [staleInvoice, currentInvoice],
    payments: [],
  });
  await assertRejectsWith(
    'checkout FAILS on the CURRENT job\'s own unpaid invoice, not silently passed via the stale paid one',
    () => service.checkout('CAR1', {} as any),
    'Payment incomplete'
  );
  restore();
})();

console.log('\n--- Scenario: checkout must fail, not use the previous invoice (fully paid current invoice IS allowed through the invoice gate) ---');

await (async () => {
  const currentPaidInvoice = {
    id: 'INV-CUR-PAID', jobId: 'J2', vehicle: 'TN01AB1234',
    isDeleted: false, status: 'Paid', amount: 5000, gst: 900, discount: 0,
    createdAt: new Date(),
  };
  const staleInvoice = {
    id: 'INV-OLD', jobId: 'J1', vehicle: 'TN01AB1234',
    isDeleted: false, status: 'Paid', amount: 999999, gst: 0, discount: 0,
    createdAt: new Date('2026-01-01'),
  };
  const { service, restore } = installFakes({
    car: CAR_CURRENT_JOB,
    job: QC_PASSED_JOB,
    invoices: [staleInvoice, currentPaidInvoice],
    payments: [],
    outpass: null, // no outpass yet — proves it got PAST the invoice gate onto the next one
  });
  await assertRejectsWith(
    'invoice gate passes on the CURRENT job\'s own paid invoice — fails later at the Outpass gate, not the invoice/payment gate, and never on the stale invoice\'s (very different) amount',
    () => service.checkout('CAR1', {} as any),
    'no approved Outpass exists'
  );
  restore();
})();

// ═══════════════════════════════════════════════════════════════════════
// Regression: the legacy (job-less) invoice fallback must still work
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- Regression: genuinely legacy (jobId: null) invoice fallback still resolves ---');

await (async () => {
  const legacyInvoice = {
    id: 'INV-LEGACY', jobId: null, vehicle: 'TN01AB1234',
    isDeleted: false, status: 'Paid', amount: 1000, gst: 180, discount: 0,
    createdAt: new Date('2025-01-01'),
  };
  const { service, restore } = installFakes({
    car: { id: 'CAR2', vehicle: 'TN01AB1234', jobCardId: 'J3' },
    job: QC_PASSED_JOB,
    invoices: [legacyInvoice],
    payments: [],
    outpass: null,
  });
  await assertRejectsWith(
    'a job-less legacy invoice for this vehicle is still found via the fallback — reaches the Outpass gate, not the invoice gate',
    () => service.checkout('CAR2', {} as any),
    'no approved Outpass exists'
  );
  restore();
})();

console.log('\n--- Regression: no invoice at all (no job match, no legacy match) still fails cleanly ---');

await (async () => {
  const { service, restore } = installFakes({
    car: CAR_CURRENT_JOB,
    job: QC_PASSED_JOB,
    invoices: [],
  });
  await assertRejectsWith(
    'no matching invoice anywhere → "no Invoice found"',
    () => service.checkout('CAR1', {} as any),
    'no Invoice found'
  );
  restore();
})();

// ═══════════════════════════════════════════════════════════════════════
// Structural: confirm the ordering and fallback scoping in source
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- Source structure ---');

const root = (p: string) => new URL(`../${p}`, import.meta.url);
const src = fs.readFileSync(root('src/modules/vehicle-checkin/service/vehicle-checkin.service.ts'), 'utf-8').replace(/\r\n/g, '\n');
const checkoutBody = src.slice(src.indexOf('async checkout('), src.indexOf('\n  async ', src.indexOf('async checkout(') + 1));

const jobIdQueryIdx = checkoutBody.indexOf('where: { jobId: car.jobCardId');
const vehicleFallbackIdx = checkoutBody.indexOf('where: { vehicle: car.vehicle, jobId: null');
assertTrue('the jobId-anchored query appears before the vehicle-string fallback', jobIdQueryIdx !== -1 && vehicleFallbackIdx !== -1 && jobIdQueryIdx < vehicleFallbackIdx);
assertTrue('the vehicle-string fallback is scoped to jobId: null (never cross-matches a different job)', vehicleFallbackIdx !== -1);
assertTrue('QC gate (assertJobQcPassed) is still present and unremoved', checkoutBody.includes('assertJobQcPassed(job, "check out")'));
assertTrue('payment gate (assertInvoicePaidOrCredit) is still present and unremoved', checkoutBody.includes('assertInvoicePaidOrCredit(invoice, totalPaid, "check out")'));
assertTrue('Outpass gate is still present and unremoved', checkoutBody.includes('no approved Outpass exists'));

console.log('\n--- OutpassService untouched (constraint: do not alter it) ---');
const outpassSrc = fs.readFileSync(root('src/modules/outpass/service/outpass.service.ts'), 'utf-8').replace(/\r\n/g, '\n');
assertTrue('resolveInvoiceForOutpass still resolves by explicit invoiceId first (unchanged)', outpassSrc.includes('private async resolveInvoiceForOutpass(invoiceId: string | null | undefined, normVeh: string) {\n    if (invoiceId) {'));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
