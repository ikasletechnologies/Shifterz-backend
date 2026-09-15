// EPB §2.13/§17.7 — Section 2 sweep Gap 2 remediation verification.
//
// AttendanceController.updateAttendance (a management correction of
// another employee's attendance record — gated by attendance:edit and by
// AttendanceService's own HQ/own-franchise scope check) previously wrote
// zero audit entries. checkIn/checkOut remain deliberately unaudited per
// the authorized scope: high-volume self-service actions where the
// Attendance row itself already provides sufficient history.
//
// This drives the real AttendanceController.updateAttendance (not a
// reimplementation) with fake req/res/next, intercepting db.attendance.*
// and db.auditLog.create — same technique
// scripts/test-epb2-13-audit-gaps.ts already established.
//
// No live database connection in this sandbox — same limitation as every
// other scripts/test-epb2-*.ts file. A real end-to-end run against a live
// database remains LIVE VERIFICATION PENDING and is not implied by this
// file passing.
//
// Run with: npx tsx scripts/test-epb2-18c-attendance-edit-audit.ts
import fs from 'node:fs';
import { AttendanceController } from '../src/modules/employee/controller/attendance.controller.js';
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
// updateAttendance — real behavioral coverage
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- AttendanceController.updateAttendance ---');

await (async () => {
  installAuditCapture();
  const originalFindById = db.attendance.findFirst?.bind(db.attendance);
  const originalFindUnique = db.attendance.findUnique.bind(db.attendance);
  const originalUpdate = db.attendance.update.bind(db.attendance);

  const existingRecord = {
    id: 'ATT-1', employeeId: 'EMP-7', franchiseId: 'FRA001', date: new Date('2026-03-01'),
    status: 'Absent', clockIn: null, clockOut: null, isDeleted: false,
  };
  // AttendanceRepository.findById — used internally by AttendanceService's
  // own authorization/existence check.
  (db.attendance as any).findFirst = async () => existingRecord;
  (db.attendance as any).findUnique = async () => existingRecord; // controller's pre-image capture
  (db.attendance as any).update = async ({ data }: any) => ({ ...existingRecord, ...data });

  const controller = new AttendanceController();
  const { req, res, next, getThrown } = fakeReqRes({
    params: { id: 'ATT-1' },
    body: { status: 'Present', clockIn: '2026-03-01T09:00:00.000Z' },
  });
  await controller.updateAttendance(req, res, next);

  assertTrue('updateAttendance does not throw', getThrown() === null);
  assertTrue('exactly one audit entry written', auditCalls.length === 1);
  assertTrue('audit module is ATTENDANCE', auditCalls[0]?.data.module === 'ATTENDANCE');
  assertTrue('audit action is UPDATE', auditCalls[0]?.data.action === 'UPDATE');
  assertTrue('audit records the acting user (the manager making the correction)', auditCalls[0]?.data.userId === 'ACTOR-1');
  assertTrue('audit oldValue captures the PREVIOUS status ("Absent")', auditCalls[0]?.data.oldValue?.status === 'Absent');
  assertTrue('audit newValue captures the UPDATED status ("Present")', auditCalls[0]?.data.newValue?.status === 'Present');
  assertTrue('audit branchId uses the RECORD\'s actual franchise, not just the actor\'s', auditCalls[0]?.data.branchId === 'FRA001');
  assertTrue('recordId matches the attendance record id', auditCalls[0]?.data.recordId === 'ATT-1');

  if (originalFindById) (db.attendance as any).findFirst = originalFindById;
  (db.attendance as any).findUnique = originalFindUnique;
  (db.attendance as any).update = originalUpdate;
  restoreAuditCapture();
})();

// ═══════════════════════════════════════════════════════════════════════
// checkIn/checkOut — confirm deliberately unaudited (per authorized scope)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- checkIn/checkOut: deliberately unaudited (authorized scope, not an oversight) ---');

await (async () => {
  installAuditCapture();
  const originalFindEmployee = db.employee.findUnique.bind(db.employee);
  const originalFindExistingCheckIn = db.attendance.findFirst.bind(db.attendance);
  const originalCreate = db.attendance.create.bind(db.attendance);

  (db.employee as any).findUnique = async () => ({ id: 'EMP-7', franchiseId: 'FRA001' });
  (db.attendance as any).findFirst = async () => null; // no existing check-in today
  (db.attendance as any).create = async ({ data }: any) => ({ id: 'ATT-NEW', ...data });

  const controller = new AttendanceController();
  const { req, res, next, getThrown } = fakeReqRes({ user: { id: 'EMP-7', role: 'TECHNICIAN', franchiseId: 'FRA001' }, body: {} });
  await controller.checkIn(req, res, next);

  assertTrue('checkIn does not throw', getThrown() === null);
  assertTrue('checkIn writes NO audit entry (self-service, high-volume — Attendance row itself is the record)', auditCalls.length === 0);

  (db.employee as any).findUnique = originalFindEmployee;
  (db.attendance as any).findFirst = originalFindExistingCheckIn;
  (db.attendance as any).create = originalCreate;
  restoreAuditCapture();
})();

// ═══════════════════════════════════════════════════════════════════════
// Structural: authorization gate preserved, no schema change
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- Structural: existing authorization and self-service behavior preserved ---');

const root = (p: string) => new URL(`../${p}`, import.meta.url);
const routesSrc = fs.readFileSync(root('src/modules/employee/routes/attendance.routes.ts'), 'utf-8').replace(/\r\n/g, '\n');
assertTrue('PUT /:id (updateAttendance) is still gated by attendance:edit', routesSrc.includes("requireAction('attendance:edit')") && routesSrc.includes('controller.updateAttendance'));
assertTrue('POST /check-in and PUT /check-out remain ungated by attendance:edit (self-service, unchanged)', !/attendance:edit[\s\S]{0,80}checkIn|checkIn[\s\S]{0,80}attendance:edit/.test(routesSrc.slice(0, routesSrc.indexOf("attendanceRouter.put('/:id'"))));

const serviceSrc = fs.readFileSync(root('src/modules/employee/service/attendance.service.ts'), 'utf-8').replace(/\r\n/g, '\n');
assertTrue('AttendanceService.updateAttendance still enforces HQ-global / own-franchise-only scope (unchanged)', serviceSrc.includes('existing.franchiseId !== (actor?.franchiseId ?? null)'));

const schemaSrc = fs.readFileSync(root('prisma/schema.prisma'), 'utf-8');
assertTrue('no schema change: Attendance model unchanged (still no audit-specific fields added)', /model Attendance \{[\s\S]*?\n\}/.exec(schemaSrc)?.[0].includes('franchiseId    String?') ?? false);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
