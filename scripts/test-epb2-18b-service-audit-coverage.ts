// EPB §18 / §2.13 — Section 2 sweep Gap 1 remediation verification.
//
// Two separate service-management surfaces exist: the actively-used
// `Service` model (src/modules/service/, what Job/Invoice/Estimate/billing
// actually select from — see Fix D's investigation) and the disconnected
// `ServiceMaster` model (src/routes/hq.ts's own CRUD block). Both had
// create/update paths with zero audit coverage; only ServiceMaster's
// DELETE (pre-existing Item #3 work, and Fix D's reference guard) was
// audited.
//
// This verifies:
//  - ServiceController.createService/updateService/deleteService (the real
//    controller methods, not a reimplementation) each call logAudit with
//    the correct module/action/actor/branch and a genuine pre-image for
//    UPDATE/DELETE — driven with fake req/res/next and intercepted at
//    db.service.* / db.auditLog.create, same technique
//    scripts/test-epb2-13-audit-gaps.ts already established for
//    PaymentsController/SettingsController/TransferController.
//  - hq.ts's ServiceMaster POST/PUT routes now call logAudit (structural —
//    these are inline anonymous Express handlers, not independently
//    callable, so verified the same way Fix A's franchise-route tests
//    verified hq.ts route wiring).
//  - The existing ServiceMaster DELETE audit (and its reference guard from
//    Fix D) is unaffected.
//
// No live database connection in this sandbox — same limitation as every
// other scripts/test-epb2-*.ts file. A real end-to-end run against a live
// database remains LIVE VERIFICATION PENDING and is not implied by this
// file passing.
//
// Run with: npx tsx scripts/test-epb2-18b-service-audit-coverage.ts
import fs from 'node:fs';
import { ServiceController } from '../src/modules/service/controller/service.controller.js';
import { db } from '../src/lib/db.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}

function fakeReqRes(overrides: any = {}) {
  const req: any = {
    user: { id: 'ACTOR-1', role: 'SUPER_ADMIN', franchiseId: null },
    params: {},
    body: {},
    ip: '203.0.113.9',
    headers: { 'user-agent': 'epb-test-agent' },
    ...overrides,
  };
  const res: any = { body: undefined, json(data: any) { this.body = data; } };
  let thrown: any = null;
  const next = (err?: any) => { thrown = err; };
  return { req, res, next, getThrown: () => thrown };
}

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

// ═══════════════════════════════════════════════════════════════════════
// ServiceController — real behavioral coverage
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- ServiceController.createService ---');

await (async () => {
  installAuditCapture();
  const originalCreate = db.service.create.bind(db.service);
  // ServiceService.createService generates the real id via generateUid("SRV")
  // before this is ever called — data.id is already that real value, so the
  // fake must return it as-is rather than a hardcoded id.
  (db.service as any).create = async ({ data }: any) => ({ isDeleted: false, ...data });

  const controller = new ServiceController();
  const { req, res, next, getThrown } = fakeReqRes({ body: { name: 'Ceramic Coating', category: 'Coating', price: 8000, duration: '4h' } });
  await controller.createService(req, res, next);

  assertTrue('createService does not throw', getThrown() === null);
  assertTrue('exactly one audit entry written', auditCalls.length === 1);
  assertTrue('audit module is SERVICE', auditCalls[0]?.data.module === 'SERVICE');
  assertTrue('audit action is CREATE', auditCalls[0]?.data.action === 'CREATE');
  assertTrue('audit records the acting user', auditCalls[0]?.data.userId === 'ACTOR-1');
  assertTrue('audit oldValue is null (nothing existed before)', auditCalls[0]?.data.oldValue === null);
  assertTrue('audit newValue captures the created record', auditCalls[0]?.data.newValue?.name === 'Ceramic Coating');
  assertTrue('recordId matches the created service\'s actual (generated) id', auditCalls[0]?.data.recordId === auditCalls[0]?.data.newValue?.id && typeof auditCalls[0]?.data.recordId === 'string' && auditCalls[0].data.recordId.startsWith('SRV'));

  (db.service as any).create = originalCreate;
  restoreAuditCapture();
})();

console.log('\n--- ServiceController.updateService ---');

await (async () => {
  installAuditCapture();
  const originalFindFirst = db.service.findFirst.bind(db.service);
  const originalFindUnique = db.service.findUnique.bind(db.service);
  const originalUpdate = db.service.update.bind(db.service);

  const existingRecord = { id: 'SRV-1', name: 'Ceramic Coating', price: 8000, warranty: '1 Year', status: 'Active', isDeleted: false };
  (db.service as any).findFirst = async () => existingRecord; // ServiceService.updateService's own existence check
  (db.service as any).findUnique = async () => existingRecord; // Controller's pre-image capture
  (db.service as any).update = async ({ data }: any) => ({ ...existingRecord, ...data });

  const controller = new ServiceController();
  const { req, res, next, getThrown } = fakeReqRes({ params: { id: 'SRV-1' }, body: { price: 9500, warranty: '2 Years' } });
  await controller.updateService(req, res, next);

  assertTrue('updateService does not throw', getThrown() === null);
  assertTrue('exactly one audit entry written', auditCalls.length === 1);
  assertTrue('audit module is SERVICE', auditCalls[0]?.data.module === 'SERVICE');
  assertTrue('audit action is UPDATE', auditCalls[0]?.data.action === 'UPDATE');
  assertTrue('audit oldValue captures the PREVIOUS price (8000), not the new one', auditCalls[0]?.data.oldValue?.price === 8000);
  assertTrue('audit newValue captures the UPDATED price (9500)', auditCalls[0]?.data.newValue?.price === 9500);
  assertTrue('audit oldValue captures the PREVIOUS warranty ("1 Year")', auditCalls[0]?.data.oldValue?.warranty === '1 Year');
  assertTrue('audit newValue captures the UPDATED warranty ("2 Years")', auditCalls[0]?.data.newValue?.warranty === '2 Years');
  assertTrue('recordId matches the updated service id', auditCalls[0]?.data.recordId === 'SRV-1');

  (db.service as any).findFirst = originalFindFirst;
  (db.service as any).findUnique = originalFindUnique;
  (db.service as any).update = originalUpdate;
  restoreAuditCapture();
})();

console.log('\n--- ServiceController.deleteService ---');

await (async () => {
  installAuditCapture();
  const originalFindFirst = db.service.findFirst.bind(db.service);
  const originalFindUnique = db.service.findUnique.bind(db.service);
  const originalUpdate = db.service.update.bind(db.service);

  const existingRecord = { id: 'SRV-2', name: 'PPF Installation', price: 20000, status: 'Active', isDeleted: false };
  (db.service as any).findFirst = async () => existingRecord;
  (db.service as any).findUnique = async () => existingRecord;
  (db.service as any).update = async ({ data }: any) => ({ ...existingRecord, ...data });

  const controller = new ServiceController();
  const { req, res, next, getThrown } = fakeReqRes({ params: { id: 'SRV-2' } });
  await controller.deleteService(req, res, next);

  assertTrue('deleteService does not throw', getThrown() === null);
  assertTrue('exactly one audit entry written', auditCalls.length === 1);
  assertTrue('audit module is SERVICE', auditCalls[0]?.data.module === 'SERVICE');
  assertTrue('audit action is DELETE', auditCalls[0]?.data.action === 'DELETE');
  assertTrue('audit oldValue captures the pre-delete record (still Active)', auditCalls[0]?.data.oldValue?.status === 'Active');
  assertTrue('audit newValue reflects the soft-deleted state (isDeleted: true)', auditCalls[0]?.data.newValue?.isDeleted === true);

  (db.service as any).findFirst = originalFindFirst;
  (db.service as any).findUnique = originalFindUnique;
  (db.service as any).update = originalUpdate;
  restoreAuditCapture();
})();

// ═══════════════════════════════════════════════════════════════════════
// hq.ts ServiceMaster CREATE/UPDATE — structural (inline route handlers,
// not independently callable — same limitation Fix A's franchise-route
// tests already documented)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- hq.ts: ServiceMaster CREATE/UPDATE route wiring ---');

const root = (p: string) => new URL(`../${p}`, import.meta.url);
const hqSource = fs.readFileSync(root('src/routes/hq.ts'), 'utf-8').replace(/\r\n/g, '\n');
function body(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) return '';
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end === -1 ? undefined : end);
}

const postBody = body(hqSource, 'hqRouter.post("/services/master"', '\nhqRouter.get("/services/master"');
assertTrue('POST /services/master handler was located', postBody.length > 0);
assertTrue('POST writes a SERVICE_MASTER CREATE audit entry', /module:\s*"SERVICE_MASTER"[\s\S]*?action:\s*"CREATE"/.test(postBody));
assertTrue('POST audit newValue is the created record', postBody.includes('newValue: service'));
assertTrue('POST audit oldValue is null (nothing existed before)', postBody.includes('oldValue: null'));

const putBody = body(hqSource, 'hqRouter.put("/services/master/:id"', '\n// Item #3');
assertTrue('PUT /services/master/:id handler was located', putBody.length > 0);
assertTrue('PUT captures a pre-image before mutating', putBody.includes('const oldValue = await db.serviceMaster.findUnique'));
assertTrue('PUT writes a SERVICE_MASTER UPDATE audit entry', /module:\s*"SERVICE_MASTER"[\s\S]*?action:\s*"UPDATE"/.test(putBody));
assertTrue('PUT audit oldValue is the captured pre-image', putBody.includes('oldValue,') || putBody.includes('oldValue: oldValue'));
assertTrue('PUT audit newValue is the updated record', putBody.includes('newValue: updated'));

console.log('\n--- ServiceMaster DELETE audit (pre-existing + Fix D reference guard) — unaffected ---');
const deleteBody = body(hqSource, 'hqRouter.delete("/services/master/:id"', '\n\n// ═══');
assertTrue('DELETE handler was located', deleteBody.length > 0);
assertTrue('DELETE still writes a SERVICE_MASTER PERMANENT_DELETE audit entry', /module:\s*"SERVICE_MASTER"[\s\S]*?action:\s*"PERMANENT_DELETE"/.test(deleteBody));
assertTrue('DELETE still calls the Fix D reference guard', deleteBody.includes('findServiceMasterReference(existing)'));
assertTrue('DELETE still requires SUPER_ADMIN (route registration, unchanged)', deleteBody.includes('requireRole("SUPER_ADMIN")'));
assertTrue('DELETE still requires a mandatory reason (unchanged)', deleteBody.includes('A reason is required to permanently delete a Service Master entry'));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
