// EPB 2.10 (follow-up) — VehicleCheckinService.checkout() was the actual,
// live "Vehicle Checkout" endpoint the frontend calls (PUT /carin/:id/checkout,
// wired to the "→ Out" button on the Car In/Out page) and it had NO outpass
// requirement at all, unlike OutpassService.approveOutpass which does. This
// verifies the fix: checkout() now shares deliveryGate.helper.ts's
// job/QC/invoice/payment gate with the outpass module AND requires an
// approved (status "Delivered", issued) OutPass before releasing the vehicle.
//
// No live database in this sandbox (see scripts/test-epb2-1-3-remediation.ts's
// header). Drives the real VehicleCheckinService.checkout() end-to-end
// against monkey-patched db.* calls — this is the actual production code
// path, not a re-implementation of it.
//
// Run with: npx tsx scripts/test-epb2-10b-checkout-gate.ts
import { VehicleCheckinService } from '../src/modules/vehicle-checkin/service/vehicle-checkin.service.js';
import { db } from '../src/lib/db.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}
async function assertBlocks(name: string, fn: () => Promise<unknown>, messageIncludes?: string) {
  try {
    await fn();
    fail++; console.log(`FAIL: ${name} — expected a rejection but it succeeded`);
  } catch (e: any) {
    if (messageIncludes && !String(e.message).includes(messageIncludes)) {
      fail++; console.log(`FAIL: ${name} — rejected, but message didn't mention "${messageIncludes}": ${e.message}`);
    } else {
      pass++; console.log(`PASS: ${name}`);
    }
  }
}
async function assertSucceeds(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    pass++; console.log(`PASS: ${name}`);
  } catch (e: any) {
    fail++; console.log(`FAIL: ${name} — unexpected rejection: ${e.message}`);
  }
}

const CAR = { id: 'CAR-1', jobCardId: 'JOB-1', vehicle: 'VEH1', phone: '9990001111', customer: 'Alice', franchiseId: 'FR-A', isDeleted: false };

let jobFixture: any = null;
let invoiceFixture: any = null;
let paymentsFixture: any[] = [];
let outpassFixture: any = null;

const originals = {
  carInFindFirst: db.carIn.findFirst.bind(db.carIn),
  carInUpdate: db.carIn.update.bind(db.carIn),
  jobFindUnique: db.job.findUnique.bind(db.job),
  jobUpdate: db.job.update.bind(db.job),
  invoiceFindFirst: db.invoice.findFirst.bind(db.invoice),
  paymentFindMany: db.payment.findMany.bind(db.payment),
  outPassFindFirst: db.outPass.findFirst.bind(db.outPass),
  jobHistoryCreate: db.jobHistory.create.bind(db.jobHistory),
  customerFindFirst: db.customer.findFirst.bind(db.customer),
};

function installMocks() {
  (db.carIn as any).findFirst = async () => ({ ...CAR });
  (db.carIn as any).update = async ({ data }: any) => ({ ...CAR, ...data });
  (db.job as any).findUnique = async () => jobFixture;
  (db.job as any).update = async ({ data }: any) => ({ ...jobFixture, ...data });
  (db.invoice as any).findFirst = async () => invoiceFixture;
  (db.payment as any).findMany = async () => paymentsFixture;
  (db.outPass as any).findFirst = async () => outpassFixture;
  (db.jobHistory as any).create = async () => ({});
  (db.customer as any).findFirst = async () => null;
}
function restoreMocks() {
  (db.carIn as any).findFirst = originals.carInFindFirst;
  (db.carIn as any).update = originals.carInUpdate;
  (db.job as any).findUnique = originals.jobFindUnique;
  (db.job as any).update = originals.jobUpdate;
  (db.invoice as any).findFirst = originals.invoiceFindFirst;
  (db.payment as any).findMany = originals.paymentFindMany;
  (db.outPass as any).findFirst = originals.outPassFindFirst;
  (db.jobHistory as any).create = originals.jobHistoryCreate;
  (db.customer as any).findFirst = originals.customerFindFirst;
}

const invoice = (overrides: any = {}) => ({ id: 'INV-1', amount: 1000, gst: 180, discount: 0, status: 'Issued', vehicle: 'VEH1', jobId: 'JOB-1', ...overrides });
const outpass = (overrides: any = {}) => ({ id: 'OP-1', carInId: 'CAR-1', jobCardId: 'JOB-1', status: 'Pending', issued: false, ...overrides });

await (async () => {
  installMocks();
  const service = new VehicleCheckinService();
  try {
    console.log('--- VehicleCheckinService.checkout() gate ---');

    jobFixture = { status: 'QC Pending', passedAt: null };
    invoiceFixture = null; paymentsFixture = []; outpassFixture = null;
    await assertBlocks('QC Pending blocks checkout', () => service.checkout('CAR-1', {} as any), 'Quality Control');

    jobFixture = { status: 'Rework Required', passedAt: null };
    await assertBlocks('QC Failed / Rework Required blocks checkout', () => service.checkout('CAR-1', {} as any), 'Quality Control');

    jobFixture = { status: 'Ready For Billing', passedAt: new Date() };
    invoiceFixture = null;
    await assertBlocks('QC passed but no invoice blocks checkout', () => service.checkout('CAR-1', {} as any), 'Invoice');

    invoiceFixture = invoice({ status: 'Issued' });
    paymentsFixture = [];
    outpassFixture = null;
    await assertBlocks('QC passed + unpaid invoice blocks checkout', () => service.checkout('CAR-1', {} as any), 'Payment');

    paymentsFixture = [{ amount: 1180 }];
    outpassFixture = null;
    await assertBlocks(
      'QC passed + fully paid BUT NO OUTPASS blocks checkout (this is the actual gap being fixed)',
      () => service.checkout('CAR-1', {} as any),
      'Outpass'
    );

    outpassFixture = outpass({ status: 'Pending', issued: false });
    await assertBlocks('an outpass that exists but is only Pending (not yet approved) still blocks checkout', () => service.checkout('CAR-1', {} as any), 'Outpass');

    outpassFixture = outpass({ status: 'Rejected', issued: false });
    await assertBlocks('a Rejected outpass blocks checkout', () => service.checkout('CAR-1', {} as any), 'Outpass');

    outpassFixture = outpass({ status: 'Delivered', issued: true });
    await assertSucceeds('job complete + QC passed + invoice paid + outpass approved (Delivered, issued) -> checkout succeeds', () => service.checkout('CAR-1', {} as any));

    // Approved credit path, no cash paid.
    jobFixture = { status: 'Ready For Billing', passedAt: new Date() };
    invoiceFixture = invoice({ status: 'Approved Credit' });
    paymentsFixture = [];
    outpassFixture = outpass({ status: 'Delivered', issued: true });
    await assertSucceeds('approved credit (zero cash paid) + approved outpass -> checkout succeeds', () => service.checkout('CAR-1', {} as any));

    console.log('\n--- VehicleCheckinService.getDeliveryReadiness() (UI-1 checklist source) ---');

    // Same 6 fixture states as above, each re-checked against the read-only
    // endpoint: its `canCheckout` must agree with what checkout() itself
    // would actually do for the identical state (the whole point of this
    // endpoint — it must never tell the UI "ok to check out" when
    // checkout() would reject, or vice versa).
    async function assertReadinessAgreesWithCheckout(name: string) {
      let checkoutSucceeded = true;
      try { await service.checkout('CAR-1', {} as any); } catch { checkoutSucceeded = false; }
      const readiness = await service.getDeliveryReadiness('CAR-1');
      assertTrue(`${name}: readiness.canCheckout agrees with checkout()'s actual outcome`, readiness.canCheckout === checkoutSucceeded);
    }

    jobFixture = { status: 'QC Pending', passedAt: null };
    invoiceFixture = null; paymentsFixture = []; outpassFixture = null;
    let readiness = await service.getDeliveryReadiness('CAR-1');
    assertTrue('readiness: QC Pending -> qcPassed false', readiness.conditions.qcPassed === false);
    assertTrue('readiness: no invoice -> invoiceGenerated false', readiness.conditions.invoiceGenerated === false);
    assertTrue('readiness: no outpass -> outpassApproved false', readiness.conditions.outpassApproved === false);
    assertTrue('readiness: canCheckout is false when nothing is met', readiness.canCheckout === false);
    assertTrue('readiness: blockingReasons lists all 3 unmet conditions (QC, invoice/payment, outpass)', readiness.blockingReasons.length === 3);
    await assertReadinessAgreesWithCheckout('QC Pending, nothing else set');

    jobFixture = { status: 'Ready For Billing', passedAt: new Date() };
    invoiceFixture = invoice({ status: 'Issued' });
    paymentsFixture = [];
    outpassFixture = null;
    readiness = await service.getDeliveryReadiness('CAR-1');
    assertTrue('readiness: QC Passed -> qcPassed true', readiness.conditions.qcPassed === true);
    assertTrue('readiness: invoice exists -> invoiceGenerated true', readiness.conditions.invoiceGenerated === true);
    assertTrue('readiness: unpaid invoice -> paymentComplete false', readiness.conditions.paymentComplete === false);
    await assertReadinessAgreesWithCheckout('QC passed, invoice exists but unpaid, no outpass');

    paymentsFixture = [{ amount: 1180 }];
    readiness = await service.getDeliveryReadiness('CAR-1');
    assertTrue('readiness: fully paid -> paymentComplete true', readiness.conditions.paymentComplete === true);
    assertTrue('readiness: still no outpass -> outpassApproved false', readiness.conditions.outpassApproved === false);
    assertTrue('readiness: canCheckout false (outpass still missing) even though job/QC/invoice/payment are all met', readiness.canCheckout === false);
    await assertReadinessAgreesWithCheckout('everything met except outpass');

    outpassFixture = outpass({ status: 'Pending', issued: false });
    readiness = await service.getDeliveryReadiness('CAR-1');
    assertTrue('readiness: Pending (not yet approved) outpass -> outpassApproved false', readiness.conditions.outpassApproved === false);
    await assertReadinessAgreesWithCheckout('outpass exists but only Pending');

    outpassFixture = outpass({ status: 'Delivered', issued: true });
    readiness = await service.getDeliveryReadiness('CAR-1');
    assertTrue('readiness: approved (Delivered+issued) outpass -> outpassApproved true', readiness.conditions.outpassApproved === true);
    assertTrue('readiness: all 5 conditions met -> canCheckout true', readiness.canCheckout === true && readiness.blockingReasons.length === 0);
    await assertReadinessAgreesWithCheckout('all 5 conditions met');

    // Structural: confirm the fix reuses the shared helper rather than a
    // second, independent implementation of the same rule.
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/modules/vehicle-checkin/service/vehicle-checkin.service.ts', import.meta.url), 'utf-8');
    assertTrue('checkout() imports the shared deliveryGate.helper.ts (single source of truth with outpass.service.ts)', src.includes("from '../../outpass/service/deliveryGate.helper.js'"));
    assertTrue('checkout() calls assertJobQcPassed (not a re-implemented substring/status check)', src.includes('assertJobQcPassed(job'));
    assertTrue('checkout() calls assertInvoicePaidOrCredit (not a re-implemented check)', src.includes('assertInvoicePaidOrCredit(invoice'));
  } finally {
    restoreMocks();
  }
})();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
