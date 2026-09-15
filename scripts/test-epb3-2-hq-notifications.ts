// EPB §3.10 — Section 3 Finding 3 remediation verification.
//
// Of the 7 named HQ notification categories, only 2 (Pending Stock
// Requests, Low Stock Alerts) had a genuinely reachable trigger. "New
// Franchise Requests" existed but was attached to the dead /api/franchise
// duplicate (retired in Finding 1), so it never actually fired. This
// verifies:
//  - "New Franchise Requests" now fires from the live POST /hq/franchises
//    (structural — inline Express handler, not independently callable).
//  - "Pending Approvals" now fires when a member transfer request is
//    created (TransferService.createTransfer — real behavioral test).
//  - "High Outstanding Payments" is a new periodic sweep
//    (dispatchOutstandingPaymentAlerts), following the exact convention
//    dispatchQcAlerts/dispatchWorkshopReminders already established — real
//    behavioral test, per-franchise threshold.
//
// CORRECTION to the Section 3 audit report: that report searched only
// src/modules for "QC Delay"/"Outstanding" triggers and concluded QC
// Delays had no active trigger. It does — dispatchQcAlerts (in
// src/shared/services/notification.service.ts, outside src/modules, which
// the audit's search missed) already implements "Delayed QC", "High QC
// Failure Rate", and "Multiple Rework Cases", wired to a reachable
// POST /qc/dispatch-alerts. This file verifies that pre-existing,
// unchanged implementation is still intact (regression-only — no claim of
// improvement here, since nothing about it changed).
//
// "System Alerts" is deliberately NOT implemented here — the EPB names it
// but gives no definition of what qualifies as one, and inventing a
// generic mechanism to satisfy an unspecified requirement would be
// exactly the kind of invented functionality this audit was told to avoid.
// Flagged for product clarification, not guessed at.
//
// Real behavioral tests drive the actual exported functions/methods (not
// reimplementations) with monkey-patched db.* calls, same technique
// established across the other scripts/test-epb*.ts files. hq.ts's inline
// route handler is verified structurally, same limitation as every other
// hq.ts route test in this batch.
//
// No live database connection in this sandbox. A real end-to-end run
// against a live database remains LIVE VERIFICATION PENDING and is not
// implied by this file passing.
//
// Run with: npx tsx scripts/test-epb3-2-hq-notifications.ts
import fs from 'node:fs';
import { dispatchOutstandingPaymentAlerts, dispatchQcAlerts } from '../src/shared/services/notification.service.js';
import { TransferService } from '../src/modules/employee/service/transfer.service.js';
import { db } from '../src/lib/db.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}

type Captured = { userId: string; title: string; message: string };
let notifications: Captured[] = [];
function installNotificationCapture() {
  notifications = [];
  (db.notification as any).create = async ({ data }: any) => { notifications.push(data); return { id: 'NOTIF-' + notifications.length, read: false, ...data }; };
}

const root = (p: string) => new URL(`../${p}`, import.meta.url);
const src = (p: string) => fs.readFileSync(root(p), 'utf-8').replace(/\r\n/g, '\n');
function body(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) return '';
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end === -1 ? undefined : end);
}

// ═══════════════════════════════════════════════════════════════════════
// New Franchise Requests — re-wired onto the live path (structural)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- POST /hq/franchises: "New Franchise Request" notification ---');

const hqSource = src('src/routes/hq.ts');
const postBody = body(hqSource, 'hqRouter.post("/franchises"', '\n// Approve a pending Franchise Activation Request');
assertTrue('sends an HQ notification on submission', postBody.includes('sendNotification(') && postBody.includes('"New Franchise Request"'));

console.log('\n--- FranchiseService.createFranchise (retired path): no longer the notification source ---');
const franchiseServiceSource = src('src/modules/franchise/service/franchise.service.ts');
assertTrue('the retired duplicate no longer sends this notification itself (moved to the live path)', !franchiseServiceSource.includes('sendNotification'));

// ═══════════════════════════════════════════════════════════════════════
// Pending Approvals — member transfer requests (real behavioral test)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- TransferService.createTransfer: "Pending Approvals" notification ---');

await (async () => {
  installNotificationCapture();
  const fakeRepository = {
    create: async (data: any, requester: string) => ({ id: 'TR-1', ...data, requestedBy: requester, status: 'Pending' }),
  } as any;
  const service = new TransferService(fakeRepository);

  const result = await service.createTransfer(
    { newMemberName: 'Jane Doe', role: 'TECHNICIAN', toFranchiseId: 'FRA002' } as any,
    'hquser1',
    'HQ_USER'
  );

  assertTrue('createTransfer still returns the created request (behavior preserved)', result.id === 'TR-1');
  assertTrue('exactly one notification sent', notifications.length === 1);
  assertTrue('notification targets HQ', notifications[0]?.userId === 'HQ');
  assertTrue('notification title reflects a pending approval', notifications[0]?.title.includes('Pending Approval'));
  assertTrue('notification message names the requester', notifications[0]?.message.includes('hquser1'));
})();

// ═══════════════════════════════════════════════════════════════════════
// High Outstanding Payments — new periodic sweep (real behavioral test)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- dispatchOutstandingPaymentAlerts: High Outstanding Payments sweep ---');

function fakeInvoiceFindMany(byFranchise: Record<string, any[]>) {
  return async (args: any) => {
    const fid = args?.where?.franchiseId;
    return byFranchise[fid] ?? [];
  };
}

await (async () => {
  installNotificationCapture();
  const originalFranchiseFindMany = db.franchise.findMany.bind(db.franchise);
  const originalInvoiceFindMany = db.invoice.findMany.bind(db.invoice);

  (db.franchise as any).findMany = async () => ([
    { id: 'FRA001', name: 'Over-Threshold Branch' },
    { id: 'FRA002', name: 'Under-Threshold Branch' },
  ]);

  const today = new Date().toISOString();
  (db.invoice as any).findMany = fakeInvoiceFindMany({
    FRA001: [{ id: 'INV1', amount: 90000, gst: 0, discount: 0, status: 'Issued', date: new Date(today) }],
    FRA002: [{ id: 'INV2', amount: 1000, gst: 0, discount: 0, status: 'Issued', date: new Date(today) }],
  });

  const result = await dispatchOutstandingPaymentAlerts();

  assertTrue('exactly one franchise crossed the threshold', result.alertedCount === 1);
  assertTrue('exactly one notification sent (only the over-threshold branch)', notifications.length === 1);
  assertTrue('notification targets HQ', notifications[0]?.userId === 'HQ');
  assertTrue('notification names the correct (over-threshold) franchise', notifications[0]?.message.includes('Over-Threshold Branch'));
  assertTrue('notification does NOT name the under-threshold franchise', !notifications[0]?.message.includes('Under-Threshold Branch'));
  assertTrue('only Active, non-deleted franchises are scanned', (() => {
    // Structural: confirm the query itself is scoped correctly, since the
    // fake above doesn't distinguish — this checks the real source.
    const notifSrc = src('src/shared/services/notification.service.ts');
    const fnBody = body(notifSrc, 'export async function dispatchOutstandingPaymentAlerts()', '\n}');
    return fnBody.includes("isDeleted: false, status: 'Active'") || fnBody.includes('isDeleted: false, status: "Active"');
  })());

  (db.franchise as any).findMany = originalFranchiseFindMany;
  (db.invoice as any).findMany = originalInvoiceFindMany;
})();

// ═══════════════════════════════════════════════════════════════════════
// Route wiring — POST /payments/dispatch-outstanding-alerts
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- Route wiring: POST /payments/dispatch-outstanding-alerts ---');

const paymentsRoutesSrc = src('src/modules/payments/routes/payments.routes.ts');
assertTrue('route registered', paymentsRoutesSrc.includes("paymentsRouter.post('/dispatch-outstanding-alerts'"));
const paymentsControllerSrc = src('src/modules/payments/controller/payments.controller.ts');
assertTrue('controller method calls the real dispatchOutstandingPaymentAlerts (not a reimplementation)', paymentsControllerSrc.includes('await dispatchOutstandingPaymentAlerts()'));

// ═══════════════════════════════════════════════════════════════════════
// Correction: QC Delays was already implemented — regression check only
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- Correction: QC Delays (dispatchQcAlerts) — pre-existing, unchanged, still intact ---');

assertTrue('dispatchQcAlerts is still exported and callable', typeof dispatchQcAlerts === 'function');
const qcRoutesSrc = src('src/modules/qc/qc.routes.ts');
assertTrue('still wired to POST /qc/dispatch-alerts', qcRoutesSrc.includes("qcRouter.post('/dispatch-alerts'"));
const notifSrcFull = src('src/shared/services/notification.service.ts');
assertTrue('still covers "Delayed QC"', notifSrcFull.includes("'Delayed QC'"));
assertTrue('still covers "High QC Failure Rate"', notifSrcFull.includes("'High QC Failure Rate'"));
assertTrue('still covers "Multiple Rework Cases"', notifSrcFull.includes("'Multiple Rework Cases'"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
