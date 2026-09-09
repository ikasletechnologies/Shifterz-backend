// RBAC-04 — executable verification that requireAction() is actually
// attached to the routes this phase wired, not just claimed in a comment.
// requireAction()'s own allow/deny/ALL_ACTIONS logic is already exhaustively
// covered by scripts/test-require-action-middleware.ts (7/7) with an
// injected fake resolver; that logic is not re-tested here. These route
// calls use the real DB-backed resolveActionPermissions() by default (no
// injectable resolver at the route-wiring call site), so a live behavioral
// test ("authorized role -> allowed", "missing action -> 403 for a real
// user") is NOT possible in this sandbox — there is no database connection.
// What IS genuinely verifiable without a DB: that each target route's own
// middleware stack actually grew (requireAction was attached, not just
// written about), same technique already used for the Purchase GST
// vendor/purchases route tests.
// Run with: npx tsx scripts/test-rbac04-route-wiring.ts
import { outpassRouter } from '../src/modules/outpass/routes/outpass.routes.js';
import { billingRouter } from '../src/modules/billing/routes/billing.routes.js';
import { paymentsRouter } from '../src/modules/payments/routes/payments.routes.js';
import { settingsRouter } from '../src/modules/settings/routes/settings.routes.js';
import { attendanceRouter } from '../src/modules/employee/routes/attendance.routes.js';
import { leaveRouter } from '../src/modules/employee/routes/leave.routes.js';
import { transferRouter } from '../src/modules/employee/routes/transfer.routes.js';
import { workflowStageRouter } from '../src/modules/workflow-stage/routes/workflow-stage.routes.js';
import { qcRouter } from '../src/modules/qc/qc.routes.js';
import { customerRouter } from '../src/modules/customer/routes/customer.routes.js';
import { reportRouter } from '../src/modules/report/routes/report.routes.js';

let pass = 0;
let fail = 0;

function layerCount(router: any, method: string, path: string): number | null {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === path && l.route.methods[method]
  );
  return layer ? layer.route.stack.length : null;
}

function assertGated(name: string, router: any, method: string, path: string) {
  const count = layerCount(router, method, path);
  if (count !== null && count > 1) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.log(`FAIL: ${name} — expected >1 middleware layer on ${method.toUpperCase()} ${path}, got ${count === null ? 'route not found' : count}`);
  }
}

// `expectedCount` accounts for pre-existing middleware (e.g. validate(...))
// that was already on the route before this phase and is untouched by it —
// "ungated" means "requireAction was not added," not "exactly one layer."
function assertUngated(name: string, router: any, method: string, path: string, expectedCount: number) {
  const count = layerCount(router, method, path);
  if (count === expectedCount) {
    pass++;
    console.log(`PASS: ${name}`);
  } else {
    fail++;
    console.log(`FAIL: ${name} — expected ${expectedCount} middleware layer(s) (deliberately not action-gated) on ${method.toUpperCase()} ${path}, got ${count === null ? 'route not found' : count}`);
  }
}

// ─── D-09 outpass:approve ────────────────────────────────────────────────
assertGated('POST /outpass/:id/approve is action-gated', outpassRouter, 'post', '/:id/approve');
assertGated('POST /outpass/:id/reject is action-gated (same action as approve)', outpassRouter, 'post', '/:id/reject');
assertUngated('POST /outpass (create) remains ungated by this phase', outpassRouter, 'post', '/', 2);

// ─── D-10 billing:cancel ─────────────────────────────────────────────────
assertGated('PATCH /invoices/:id/cancel is action-gated', billingRouter, 'patch', '/:id/cancel');
assertUngated('POST /invoices/:id/convert remains ungated by this phase', billingRouter, 'post', '/:id/convert', 1);

// ─── D-11 payments:refund ────────────────────────────────────────────────
assertGated('POST /payments/refund is action-gated', paymentsRouter, 'post', '/refund');
assertUngated('POST /payments (create) remains ungated by this phase', paymentsRouter, 'post', '/', 2);

// ─── D-12 settings:edit ──────────────────────────────────────────────────
assertGated('PUT /settings is action-gated', settingsRouter, 'put', '/');

// ─── D-14 attendance:edit (self-service excluded) ────────────────────────
assertGated('PUT /attendance/:id is action-gated', attendanceRouter, 'put', '/:id');
assertUngated('POST /attendance/check-in remains self-service, not action-gated', attendanceRouter, 'post', '/check-in', 2);
assertUngated('PUT /attendance/check-out remains self-service, not action-gated', attendanceRouter, 'put', '/check-out', 2);

// ─── D-15 leave:approve ──────────────────────────────────────────────────
assertGated('POST /leaves/:id/approve is action-gated', leaveRouter, 'post', '/:id/approve');
assertGated('POST /leaves/:id/reject is action-gated (same action as approve)', leaveRouter, 'post', '/:id/reject');
assertUngated('POST /leaves/request remains ungated (self-service)', leaveRouter, 'post', '/request', 1);

// ─── D-16 members:transfer:approve ────────────────────────────────────────
assertGated('POST /member-transfers/:id/approve is action-gated', transferRouter, 'post', '/:id/approve');
assertGated('POST /member-transfers/:id/reject is action-gated (same action as approve)', transferRouter, 'post', '/:id/reject');
assertUngated('POST /member-transfers (create) remains ungated — D-16B still parked', transferRouter, 'post', '/', 2);

// ─── D-17 workflow:stages:manage ─────────────────────────────────────────
assertGated('POST /workflow-stages is action-gated', workflowStageRouter, 'post', '/');
assertGated('PUT /workflow-stages/:id is action-gated', workflowStageRouter, 'put', '/:id');
assertGated('DELETE /workflow-stages/:id is action-gated', workflowStageRouter, 'delete', '/:id');
assertUngated('GET /workflow-stages (read/use) remains ungated', workflowStageRouter, 'get', '/', 1);

// ─── D-18 qc:templates:manage ────────────────────────────────────────────
assertGated('POST /qc/checklist-template is action-gated', qcRouter, 'post', '/checklist-template');
assertGated('PUT /qc/checklist-template/:id is action-gated', qcRouter, 'put', '/checklist-template/:id');
assertGated('DELETE /qc/checklist-template/:id is action-gated', qcRouter, 'delete', '/checklist-template/:id');
assertUngated('GET /qc/checklist-template (read/use) remains ungated — view/use deferred/TBD', qcRouter, 'get', '/checklist-template', 1);

// ─── D-19 vehicles:history:view ──────────────────────────────────────────
assertGated('GET /customers/vehicles/:vehicleNo/history is action-gated', customerRouter, 'get', '/vehicles/:vehicleNo/history');

// ─── D-13 reports/exports — representative sample across all domains ────
assertGated('GET /reports/billing/gstr1 is action-gated', reportRouter, 'get', '/billing/gstr1');
assertGated('GET /reports/billing/export is action-gated (export action)', reportRouter, 'get', '/billing/export');
assertGated('GET /reports/reception/appointments is action-gated', reportRouter, 'get', '/reception/appointments');
assertGated('GET /reports/workshop/progress is action-gated', reportRouter, 'get', '/workshop/progress');
assertGated('GET /reports/qc/register is action-gated', reportRouter, 'get', '/qc/register');
assertGated('GET /reports/hq-summary is action-gated (the highest-priority route in this batch)', reportRouter, 'get', '/hq-summary');
assertGated('GET /reports/crm/register is action-gated', reportRouter, 'get', '/crm/register');
assertGated('GET /reports/customer/register is action-gated', reportRouter, 'get', '/customer/register');
assertGated('GET /reports/employee/attendance is action-gated', reportRouter, 'get', '/employee/attendance');
assertGated('GET /reports/financial/payment-register is action-gated', reportRouter, 'get', '/financial/payment-register');
assertGated('GET /reports/inventory/register is action-gated', reportRouter, 'get', '/inventory/register');
assertUngated('GET /reports (ERP summary) remains ungated — not a D-13 named domain', reportRouter, 'get', '/', 1);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
