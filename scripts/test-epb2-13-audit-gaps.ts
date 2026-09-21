// EPB 2.13 — Audit Gaps: verifies the three closed gaps (payments, settings,
// member-transfer approve/reject) actually write an audit entry with the
// correct actor/branch/old-new values, and that a plaintext secret never
// reaches the log.
//
// No live database in this sandbox (see scripts/test-epb2-1-3-remediation.ts's
// header). This drives the real controllers (PaymentsController,
// SettingsController, TransferController — unchanged, the actual HTTP
// entrypoints) with fake req/res/next objects, and intercepts at two points
// only: the *Service.prototype methods they call (service/repository logic
// is unchanged and already covered elsewhere) and db.auditLog.create /
// db.payment.findUnique / db.memberTransferRequest.findUnique (the only raw
// db.* calls these controllers make directly). This proves the actual
// logAudit call shape the controllers produce, not just that some function
// named logAudit exists in the file.
//
// Run with: npx tsx scripts/test-epb2-13-audit-gaps.ts
import { PaymentsController } from '../src/modules/payments/controller/payments.controller.js';
import { PaymentsService } from '../src/modules/payments/service/payments.service.js';
import { SettingsController } from '../src/modules/settings/controller/settings.controller.js';
import { SettingsService } from '../src/modules/settings/service/settings.service.js';
import { TransferController } from '../src/modules/employee/controller/transfer.controller.js';
import { TransferService } from '../src/modules/employee/service/transfer.service.js';
import { redactSensitive } from '../src/shared/services/audit.service.js';
import { db } from '../src/lib/db.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}

function fakeReqRes(overrides: any = {}) {
  const req: any = {
    user: { id: 'ACTOR-1', role: 'HQ_USER', franchiseId: null },
    params: {},
    body: {},
    ip: '203.0.113.9',
    headers: { 'user-agent': 'epb-test-agent' },
    ...overrides,
  };
  const res: any = { body: undefined, json(data: any) { this.body = data; } };
  let thrown: any = null;
  const next = (err?: any) => { thrown = err; };
  return { req, res, next: next as (err?: any) => void, getThrown: () => thrown };
}

// ── Capture every db.auditLog.create call ──────────────────────────────────
type Captured = { data: any };
let auditCalls: Captured[] = [];
const originalAuditCreate = db.auditLog.create.bind(db.auditLog);
function installAuditCapture() {
  auditCalls = [];
  (db.auditLog as any).create = async ({ data }: any) => { auditCalls.push({ data }); return { id: 'AUDIT-' + auditCalls.length, ...data }; };
}
function restoreAuditCapture() {
  (db.auditLog as any).create = originalAuditCreate;
}
function jsonContains(value: any, needle: string): boolean {
  return JSON.stringify(value ?? null).includes(needle);
}

// ═══════════════════════════════════════════════════════════════════════
// redactSensitive — direct unit coverage of the shared helper
// ═══════════════════════════════════════════════════════════════════════
console.log('--- redactSensitive ---');
assertTrue('redacts a top-level "password" key', (redactSensitive({ password: 'hunter2', name: 'X' }) as any).password === '[REDACTED]');
assertTrue('leaves non-sensitive keys untouched', (redactSensitive({ password: 'hunter2', name: 'X' }) as any).name === 'X');
assertTrue('redacts case-insensitively (Password, SECRET_TOKEN)', (redactSensitive({ Password: 'a', SECRET_TOKEN: 'b' }) as any).Password === '[REDACTED]' && (redactSensitive({ Password: 'a', SECRET_TOKEN: 'b' }) as any).SECRET_TOKEN === '[REDACTED]');
assertTrue('redacts nested object fields (e.g. inside a JSON settings blob)', (redactSensitive({ notificationTemplates: { smtpPassword: 'supersecret' } }) as any).notificationTemplates.smtpPassword === '[REDACTED]');
assertTrue('redacts inside arrays of objects', (redactSensitive([{ apiKey: 'k1' }, { apiKey: 'k2' }]) as any)[0].apiKey === '[REDACTED]');
assertTrue('passes through null/undefined unchanged', redactSensitive(null) === null && redactSensitive(undefined) === undefined);

// ═══════════════════════════════════════════════════════════════════════
// Payments
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Payments audit ---');
await (async () => {
  installAuditCapture();
  const paymentsById: Record<string, any> = {
    'PAY-1': { id: 'PAY-1', franchiseId: 'FR-A', amount: 500, client: 'Alice', mode: 'Cash' },
  };
  const originalPaymentFindUnique = db.payment.findUnique.bind(db.payment);
  (db.payment as any).findUnique = async ({ where }: any) => paymentsById[where.id] ?? null;

  const origCreatePayment = PaymentsService.prototype.createPayment;
  const origCreateRefund = PaymentsService.prototype.createRefund;
  const origDeletePayment = PaymentsService.prototype.deletePayment;
  (PaymentsService.prototype as any).createPayment = async function (_data: any, _scope: any) {
    return { id: 'PAY-2', franchiseId: 'FR-A', amount: 750, client: 'Bob' };
  };
  (PaymentsService.prototype as any).createRefund = async function (data: any, _scope: any) {
    return { id: 'RFND-1', franchiseId: 'FR-A', amount: -100, client: 'Alice', originalReceiptRef: data.originalPaymentId };
  };
  (PaymentsService.prototype as any).deletePayment = async function (_id: string, _scope: any) { return undefined; };

  try {
    const controller = new PaymentsController();

    auditCalls = [];
    let ctx = fakeReqRes({ user: { id: 'ACTOR-PAY', role: 'FRANCHISE_ADMIN', franchiseId: 'FR-A' }, body: { amount: 750, client: 'Bob' } });
    await controller.createPayment(ctx.req, ctx.res, ctx.next);
    assertTrue('createPayment writes exactly one audit entry', auditCalls.length === 1);
    assertTrue('createPayment audit: module PAYMENT, action CREATE', auditCalls[0]?.data.module === 'PAYMENT' && auditCalls[0]?.data.action === 'CREATE');
    assertTrue('createPayment audit: correct actor (req.user.id)', auditCalls[0]?.data.userId === 'ACTOR-PAY');
    assertTrue('createPayment audit: correct branch (from the created record)', auditCalls[0]?.data.branchId === 'FR-A');
    assertTrue('createPayment audit: newValue reflects the created payment', jsonContains(auditCalls[0]?.data.newValue, 'PAY-2'));
    assertTrue('createPayment audit: oldValue is null (new record)', auditCalls[0]?.data.oldValue === null);

    auditCalls = [];
    ctx = fakeReqRes({ user: { id: 'ACTOR-REFUND', role: 'HQ_USER', franchiseId: null }, body: { originalPaymentId: 'PAY-1', amount: 100, reason: 'Customer request' } });
    await controller.createRefund(ctx.req, ctx.res, ctx.next);
    assertTrue('createRefund writes exactly one audit entry', auditCalls.length === 1);
    assertTrue('createRefund audit: module PAYMENT, action REFUND', auditCalls[0]?.data.module === 'PAYMENT' && auditCalls[0]?.data.action === 'REFUND');
    assertTrue('createRefund audit: correct actor', auditCalls[0]?.data.userId === 'ACTOR-REFUND');
    assertTrue('createRefund audit: oldValue is the original payment', jsonContains(auditCalls[0]?.data.oldValue, 'PAY-1'));
    assertTrue('createRefund audit: newValue is the refund record', jsonContains(auditCalls[0]?.data.newValue, 'RFND-1'));

    auditCalls = [];
    ctx = fakeReqRes({ user: { id: 'ACTOR-DEL', role: 'SUPER_ADMIN', franchiseId: null }, params: { id: 'PAY-1' } });
    await controller.deletePayment(ctx.req, ctx.res, ctx.next);
    assertTrue('deletePayment writes exactly one audit entry (previously ZERO — this is the closed gap)', auditCalls.length === 1);
    assertTrue('deletePayment audit: module PAYMENT, action DELETE', auditCalls[0]?.data.module === 'PAYMENT' && auditCalls[0]?.data.action === 'DELETE');
    assertTrue('deletePayment audit: correct actor', auditCalls[0]?.data.userId === 'ACTOR-DEL');
    assertTrue('deletePayment audit: correct branch (from the deleted record)', auditCalls[0]?.data.branchId === 'FR-A');
    assertTrue('deletePayment audit: oldValue captures the deleted payment', jsonContains(auditCalls[0]?.data.oldValue, 'PAY-1'));
    assertTrue('deletePayment audit: newValue is null (gone)', auditCalls[0]?.data.newValue === null);
  } finally {
    (db.payment as any).findUnique = originalPaymentFindUnique;
    PaymentsService.prototype.createPayment = origCreatePayment;
    PaymentsService.prototype.createRefund = origCreateRefund;
    PaymentsService.prototype.deletePayment = origDeletePayment;
    restoreAuditCapture();
  }
})();

// ═══════════════════════════════════════════════════════════════════════
// Settings
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Settings audit ---');
await (async () => {
  installAuditCapture();
  const oldSettings = { id: 'default', companyName: 'Old Co', gstin: 'GST1', notificationTemplates: { smtpPassword: 'oldsecret' } };
  const newSettings = { id: 'default', companyName: 'New Co', gstin: 'GST1', notificationTemplates: { smtpPassword: 'newsecret' } };
  const origGet = SettingsService.prototype.getSettings;
  const origUpdate = SettingsService.prototype.updateSettings;
  (SettingsService.prototype as any).getSettings = async function () { return oldSettings; };
  (SettingsService.prototype as any).updateSettings = async function (_data: any) { return newSettings; };

  try {
    const controller = new SettingsController();
    const ctx = fakeReqRes({ user: { id: 'ACTOR-SETTINGS', role: 'SUPER_ADMIN', franchiseId: null }, body: { companyName: 'New Co' } });
    await controller.updateSettings(ctx.req, ctx.res, ctx.next);

    assertTrue('updateSettings writes exactly one audit entry (previously ZERO)', auditCalls.length === 1);
    assertTrue('updateSettings audit: module SETTINGS, action UPDATE', auditCalls[0]?.data.module === 'SETTINGS' && auditCalls[0]?.data.action === 'UPDATE');
    assertTrue('updateSettings audit: correct actor', auditCalls[0]?.data.userId === 'ACTOR-SETTINGS');
    assertTrue('updateSettings audit: oldValue shows the old company name', jsonContains(auditCalls[0]?.data.oldValue, 'Old Co'));
    assertTrue('updateSettings audit: newValue shows the new company name', jsonContains(auditCalls[0]?.data.newValue, 'New Co'));
    assertTrue('updateSettings audit: nested smtpPassword is redacted, not leaked in oldValue', !jsonContains(auditCalls[0]?.data.oldValue, 'oldsecret'));
    assertTrue('updateSettings audit: nested smtpPassword is redacted, not leaked in newValue', !jsonContains(auditCalls[0]?.data.newValue, 'newsecret'));
  } finally {
    SettingsService.prototype.getSettings = origGet;
    SettingsService.prototype.updateSettings = origUpdate;
    restoreAuditCapture();
  }
})();

// ═══════════════════════════════════════════════════════════════════════
// Member Transfer approve/reject
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Member Transfer approve/reject audit ---');
await (async () => {
  installAuditCapture();
  let requestState: any = {
    id: 'REQ-1', status: 'Pending', toFranchiseId: 'FR-A', role: 'TECHNICIAN',
    newMemberName: 'New Guy', password: 'plaintext-pass-123',
  };
  const originalFindUnique = db.memberTransferRequest.findUnique.bind(db.memberTransferRequest);
  (db.memberTransferRequest as any).findUnique = async ({ where }: any) => (where.id === 'REQ-1' ? { ...requestState } : null);

  const origApprove = TransferService.prototype.approveTransfer;
  const origReject = TransferService.prototype.rejectTransfer;

  try {
    const controller = new TransferController();

    // Approve — the "new member" branch, so both a MEMBER_TRANSFER/APPROVE
    // entry AND the EMPLOYEE/CREATE_FROM_TRANSFER entry (from 2.3) should appear.
    (TransferService.prototype as any).approveTransfer = async function (_id: string, _role: string) {
      requestState = { ...requestState, status: 'Approved' };
      return { success: true, message: 'ok', employee: { id: 'EMP-NEW-1', franchiseId: 'FR-A', name: 'New Guy' } };
    };
    auditCalls = [];
    let ctx = fakeReqRes({ user: { id: 'ACTOR-APPROVE', role: 'HQ_USER', franchiseId: null }, params: { id: 'REQ-1' } });
    await controller.approveTransfer(ctx.req, ctx.res, ctx.next);

    const approveAudit = auditCalls.find(c => c.data.module === 'MEMBER_TRANSFER');
    const employeeAudit = auditCalls.find(c => c.data.module === 'EMPLOYEE');
    assertTrue('approveTransfer writes a MEMBER_TRANSFER audit entry (previously ZERO)', !!approveAudit);
    assertTrue('approveTransfer MEMBER_TRANSFER audit: action APPROVE', approveAudit?.data.action === 'APPROVE');
    assertTrue('approveTransfer MEMBER_TRANSFER audit: correct actor', approveAudit?.data.userId === 'ACTOR-APPROVE');
    assertTrue('approveTransfer MEMBER_TRANSFER audit: correct branch (toFranchiseId)', approveAudit?.data.branchId === 'FR-A');
    assertTrue('approveTransfer MEMBER_TRANSFER audit: oldValue shows Pending', jsonContains(approveAudit?.data.oldValue, 'Pending'));
    assertTrue('approveTransfer MEMBER_TRANSFER audit: newValue shows Approved', jsonContains(approveAudit?.data.newValue, 'Approved'));
    assertTrue('approveTransfer MEMBER_TRANSFER audit: newValue captures the resulting employee', jsonContains(approveAudit?.data.newValue, 'EMP-NEW-1'));
    assertTrue('approveTransfer MEMBER_TRANSFER audit: plaintext password NOT leaked in oldValue', !jsonContains(approveAudit?.data.oldValue, 'plaintext-pass-123'));
    assertTrue('approveTransfer MEMBER_TRANSFER audit: plaintext password NOT leaked in newValue', !jsonContains(approveAudit?.data.newValue, 'plaintext-pass-123'));
    assertTrue('approveTransfer still also audits the provisioned EMPLOYEE (2.3 entry preserved)', !!employeeAudit && employeeAudit.data.action === 'CREATE_FROM_TRANSFER' && employeeAudit.data.recordId === 'EMP-NEW-1');

    // Reject — existing-employee-style request, no employee side effect.
    requestState = { id: 'REQ-2', status: 'Pending', toFranchiseId: 'FR-B', role: 'TECHNICIAN', password: 'plaintext-pass-456' };
    (db.memberTransferRequest as any).findUnique = async ({ where }: any) => (where.id === 'REQ-2' ? { ...requestState } : null);
    (TransferService.prototype as any).rejectTransfer = async function (_id: string, _role: string) {
      requestState = { ...requestState, status: 'Rejected' };
      return { success: true, message: 'Request rejected' };
    };
    auditCalls = [];
    ctx = fakeReqRes({ user: { id: 'ACTOR-REJECT', role: 'HQ_USER', franchiseId: null }, params: { id: 'REQ-2' } });
    await controller.rejectTransfer(ctx.req, ctx.res, ctx.next);

    assertTrue('rejectTransfer writes exactly one audit entry (previously ZERO)', auditCalls.length === 1);
    assertTrue('rejectTransfer audit: module MEMBER_TRANSFER, action REJECT', auditCalls[0]?.data.module === 'MEMBER_TRANSFER' && auditCalls[0]?.data.action === 'REJECT');
    assertTrue('rejectTransfer audit: correct actor', auditCalls[0]?.data.userId === 'ACTOR-REJECT');
    assertTrue('rejectTransfer audit: correct branch (toFranchiseId)', auditCalls[0]?.data.branchId === 'FR-B');
    assertTrue('rejectTransfer audit: oldValue shows Pending, newValue shows Rejected', jsonContains(auditCalls[0]?.data.oldValue, 'Pending') && jsonContains(auditCalls[0]?.data.newValue, 'Rejected'));
    assertTrue('rejectTransfer audit: plaintext password NOT leaked', !jsonContains(auditCalls[0]?.data.oldValue, 'plaintext-pass-456') && !jsonContains(auditCalls[0]?.data.newValue, 'plaintext-pass-456'));
  } finally {
    (db.memberTransferRequest as any).findUnique = originalFindUnique;
    TransferService.prototype.approveTransfer = origApprove;
    TransferService.prototype.rejectTransfer = origReject;
    restoreAuditCapture();
  }
})();

// ═══════════════════════════════════════════════════════════════════════
// Architecture: no redesign — the same logAudit()/AuditLog stay canonical
// ═══════════════════════════════════════════════════════════════════════
console.log('\n--- Architecture ---');
{
  const fs = await import('node:fs');
  const src = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf-8');
  const auditService = src('src/shared/services/audit.service.ts');
  assertTrue('exactly one logAudit implementation exists (still the single canonical mechanism)', (auditService.match(/export async function logAudit/g) || []).length === 1);
  assertTrue('exactly one redactSensitive implementation exists (helper, not a second audit system)', (auditService.match(/export function redactSensitive/g) || []).length === 1);
  const paymentsController = src('src/modules/payments/controller/payments.controller.ts');
  const settingsController = src('src/modules/settings/controller/settings.controller.ts');
  const transferController = src('src/modules/employee/controller/transfer.controller.ts');
  assertTrue('payments controller imports logAudit from the shared service, not a local reimplementation', paymentsController.includes("from '../../../shared/services/audit.service.js'"));
  assertTrue('settings controller imports logAudit from the shared service', settingsController.includes("from '../../../shared/services/audit.service.js'"));
  assertTrue('transfer controller imports logAudit from the shared service', transferController.includes("from '../../../shared/services/audit.service.js'"));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
