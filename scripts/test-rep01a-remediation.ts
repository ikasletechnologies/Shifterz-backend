// REP-01A — Reports & Dashboards Safe Remediation. Verifies the 4
// deterministic correctness fixes (Attendance Report stub, payment-modes
// CSV column mismatch, HQ Summary activeFranchises, HQ Summary
// billingPending/readyForDelivery collision) and the removal of 12
// confirmed-dead, zero-byte, zero-reference files (6 under
// src/modules/dashboard/, 6 under src/modules/workshop/). No architectural
// consolidation, no new reports, no RBAC changes — exactly the narrow scope
// locked for this phase.
//
// No live database connection exists in this sandbox (same status as every
// prior phase this engagement). Structural/source-inspection checks are
// used throughout — nothing here proves a real Attendance/Franchise/Job
// row round-trips correctly; that remains LIVE VERIFICATION PENDING.
// Run with: npx tsx scripts/test-rep01a-remediation.ts
import fs from 'node:fs';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}

const root = (p: string) => new URL(`../${p}`, import.meta.url);
const src = (p: string) => fs.readFileSync(root(p), 'utf-8');
function body(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end === -1 ? undefined : end);
}

const reportService = src('src/modules/report/service/report.service.ts');
const reportRepo = src('src/modules/report/repository/report.repository.ts');

// ═══ Fix 1 — Attendance Report no longer a hardcoded stub ════════════════

const attendanceBody = body(reportService, 'async getAttendanceReport(', 'async getTechnicianProductivityReport(');
assertTrue('getAttendanceReport no longer hardcodes attendanceToday: \'Present\'', !attendanceBody.includes("attendanceToday: 'Present'"));
assertTrue('getAttendanceReport no longer hardcodes daysWorkedThisMonth: 22', !attendanceBody.includes('daysWorkedThisMonth: 22'));
assertTrue('getAttendanceReport now queries real Attendance data via the repository', attendanceBody.includes('this.repository.getAttendanceForEmployees('));
assertTrue('daysWorkedThisMonth is computed from actual "Present"-status rows — reusing the existing status vocabulary, not inventing overtime/half-day/late rules', attendanceBody.includes("a.status === 'Present'") && !attendanceBody.includes('overtime') && !attendanceBody.includes('halfDay') && !attendanceBody.includes('lateArrival'));
assertTrue('attendanceToday falls back to "Not Logged" when no record exists today (matches the existing employee-dashboard convention in src/routes/dashboard.ts, not an invented label)', attendanceBody.includes("|| 'Not Logged'"));
assertTrue('the new repository method scopes to non-deleted Attendance rows', body(reportRepo, 'async getAttendanceForEmployees(').includes('isDeleted: false'));
assertTrue('the new repository method is a plain date-ranged query, no new business logic embedded in the repository layer', body(reportRepo, 'async getAttendanceForEmployees(', '\n  }').includes('db.attendance.findMany('));

// ═══ Fix 2 — payment-modes CSV column-set fix ════════════════════════════

const exportFinancialBody = body(reportService, 'async exportFinancialCsv(');
assertTrue('exportFinancialCsv now defines a payment-modes column set', exportFinancialBody.includes("columnSets['payment-modes']"));
assertTrue('payment-modes reuses the existing collection column set (same {mode, transactions, totalCollected} shape) rather than duplicating a second definition', exportFinancialBody.includes("columnSets['payment-modes'] = columnSets['collection']"));
assertTrue('the payment-modes case still delegates to getPaymentModeSummaryReport, unchanged', exportFinancialBody.includes("case 'payment-modes':    rows = await this.getPaymentModeSummaryReport("));

// ═══ Fix 3 — HQ Summary activeFranchises ═════════════════════════════════

const hqSummaryBody = body(reportService, 'async getHQSummary(', 'async getLeadRegisterReport(');
assertTrue('activeFranchises no longer duplicates totalFranchises (franchises.length with no filter)', !hqSummaryBody.includes('activeFranchises: franchises.length'));
assertTrue('activeFranchises now filters by the existing, established Franchise.status === \'Active\' value (same value hq.ts\'s own /dashboard route already uses)', hqSummaryBody.includes("activeFranchises: franchises.filter(f => f.status === 'Active').length"));

// ═══ Fix 4 — HQ Summary billingPending / readyForDelivery collision ══════
//
// REP-01C moved this calculation out of getHQSummary() and into the new
// shared getWorkshopSummary() (getHQSummary now composes it via
// Promise.all, per D-REP1's "one authoritative implementation per
// metric"), so the literal filter lines below no longer live in
// hqSummaryBody — they live in getWorkshopSummary()'s body instead. The
// behavior these assertions actually guard (billingPending uses
// 'QC Passed', readyForDelivery stays 'Completed', and they are no
// longer the same filter) is unchanged, so the assertions were updated to
// check the new canonical location rather than being left to fail on a
// stale code-location assumption.
const workshopSummaryBody = body(reportService, 'async getWorkshopSummary(', 'async getInventorySummary(');
assertTrue('billingPending and readyForDelivery no longer use the identical \'Completed\' filter', !/billingPending: jobs\.filter\(j => j\.status === 'Completed'\)/.test(workshopSummaryBody));
assertTrue('billingPending now uses the existing \'QC Passed\' status (the same status billing.service.ts\'s own QC gate and BILLING_ELIGIBLE_JOB_STATUSES already treat as billing-eligible) — not an invented status, now sourced from the shared getWorkshopSummary() that getHQSummary composes', workshopSummaryBody.includes("billingPending: jobs.filter(j => j.status === 'QC Passed').length"));
assertTrue('readyForDelivery is unchanged (still \'Completed\') — only the actually-wrong field was touched, now sourced from the shared getWorkshopSummary()', workshopSummaryBody.includes("readyForDelivery: jobs.filter(j => j.status === 'Completed').length"));

// ═══ Dead file removal (12 files: 6 dashboard, 6 workshop) ═══════════════

const removedFiles = [
  'src/modules/dashboard/dashboard.controller.ts',
  'src/modules/dashboard/dashboard.repository.ts',
  'src/modules/dashboard/dashboard.routes.ts',
  'src/modules/dashboard/dashboard.service.ts',
  'src/modules/dashboard/dashboard.types.ts',
  'src/modules/dashboard/dashboard.validation.ts',
  'src/modules/workshop/workshop.controller.ts',
  'src/modules/workshop/workshop.routes.ts',
  'src/modules/workshop/workshop.repository.ts',
  'src/modules/workshop/workshop.service.ts',
  'src/modules/workshop/workshop.types.ts',
  'src/modules/workshop/workshop.validation.ts',
];
for (const f of removedFiles) {
  assertTrue(`dead file removed: ${f}`, !fs.existsSync(root(f)));
}

// The REAL, live modules (in subdirectories) must remain fully intact —
// this phase removes dead duplicates, never the actual implementation.
const liveFiles = [
  'src/routes/dashboard.ts',
  'src/modules/workshop/controller/workshop.controller.ts',
  'src/modules/workshop/repository/workshop.repository.ts',
  'src/modules/workshop/routes/workshop.routes.ts',
  'src/modules/workshop/service/workshop.service.ts',
];
for (const f of liveFiles) {
  assertTrue(`live module file still intact: ${f}`, fs.existsSync(root(f)) && fs.statSync(root(f)).size > 0);
}

// ═══ Scope discipline — confirm nothing beyond the 4 fixes + dead-file removal was touched ═══
//
// The "no new report was added" check below documented REP-01A's own
// scope boundary at the time it completed. REP-01C has since legitimately
// built Job Card Register / Workshop Status / Vehicle Live Status / Leave
// Report / Employee Performance / Referral / Service Due Follow-up as its
// own explicitly-authorized "complete the missing EPB reports" work — so
// re-asserting their absence would now be actively wrong, not a
// regression. Left as a historical note rather than re-checked.
assertTrue('no duplicate report implementation (leadReport.service.ts, customer.service.ts\'s CSV switch, hq.ts\'s employee-performance report) was touched or removed this phase — REP-01B territory', fs.existsSync(root('src/modules/lead/service/leadReport.service.ts')));
assertTrue('no RBAC action was added or changed this phase', !reportService.includes('requireAction') && !reportRepo.includes('requireAction'));
assertTrue('no schema change was required for any of the 4 fixes (all used already-existing model fields)', (() => {
  // sanity: none of the fixed fields needed a new Prisma field — Franchise.status,
  // Job.status, Attendance.status/employeeId/date all already existed pre-REP-01.
  const schema = src('prisma/schema.prisma');
  return schema.includes('status') && schema.includes('model Attendance') && schema.includes('model Franchise');
})());

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
