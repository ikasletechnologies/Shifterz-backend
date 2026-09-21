// EPB §3.8/§12.7/§12.8 — Section 3 Finding 2B remediation verification.
//
// getEmployeePerformanceReport previously derived every job-based metric
// (Jobs Assigned/Completed/Pending, QC Failures, Rework Count) from
// Job.technicianId/serviceAdvisorId — fields a Quality Inspector is never
// the value of. That made every QI's metrics structurally 0, regardless of
// how much QC work they actually did (a "silently zero" bug, not just an
// unpopulated field).
//
// Fixed by reusing the existing QCInspection table (one row per inspection
// attempt — attemptNumber, inspectorId, result, decidedAt — already written
// by qc.service.ts's decide(), see 12.6/12.7) for employees whose role is
// QUALITY_INSPECTOR, while leaving the technician/service-advisor branch
// completely untouched. No new QC model was introduced.
//
// Two layers of real (not reimplemented) coverage, same technique as
// scripts/test-epb3-2a-revenue-contribution.ts:
//  1. ReportRepository.getQCInspectionsForEmployeePerformance — the actual
//     method, against a Prisma-where-clause-aware fake db.qCInspection
//     store.
//  2. ReportService.getEmployeePerformanceReport — the actual method, using
//     the REAL ReportRepository, with only db.* mocked — covering a QC
//     pass, a QC failure, a rework/re-inspection by the SAME inspector, a
//     rework/re-inspection by a DIFFERENT inspector (attributed to the
//     re-checker, not blamed on them), a still-pending inspection, and a
//     control technician whose metrics must be byte-for-byte unaffected.
//
// No live database connection in this sandbox. A real end-to-end run
// against a live database remains LIVE VERIFICATION PENDING and is not
// implied by this file passing.
//
// Run with: npx tsx scripts/test-epb3-2b-qi-metrics.ts
import { ReportRepository } from '../src/modules/report/repository/report.repository.js';
import { ReportService } from '../src/modules/report/service/report.service.js';
import { db } from '../src/lib/db.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// ── Fixture: a mix of passes, failures, and rework re-inspections, spread
// across two inspectors, so cross-inspector attribution can be verified. ──
const FIXTURE_INSPECTIONS = [
  { id: 'QCI-1', jobId: 'J1', attemptNumber: 1, inspectorId: 'QI-A', result: 'Passed', createdAt: daysAgo(5) },
  { id: 'QCI-2', jobId: 'J2', attemptNumber: 1, inspectorId: 'QI-A', result: 'Failed', createdAt: daysAgo(9) },
  { id: 'QCI-3', jobId: 'J2', attemptNumber: 2, inspectorId: 'QI-A', result: 'Passed', createdAt: daysAgo(8) }, // rework re-check, SAME inspector
  { id: 'QCI-4', jobId: 'J3', attemptNumber: 1, inspectorId: 'QI-A', result: 'Pending', createdAt: daysAgo(1) }, // not yet decided
  { id: 'QCI-5', jobId: 'J4', attemptNumber: 1, inspectorId: 'QI-B', result: 'Failed', createdAt: daysAgo(7) },
  { id: 'QCI-6', jobId: 'J4', attemptNumber: 2, inspectorId: 'QI-A', result: 'Passed', createdAt: daysAgo(6) }, // rework re-check, DIFFERENT inspector than who failed it
];

function fakeQCInspectionFindMany(rows: typeof FIXTURE_INSPECTIONS) {
  return async (args: any) => {
    const where = args?.where ?? {};
    return rows.filter((r) => {
      if (where.inspectorId && r.inspectorId !== where.inspectorId) return false;
      if (where.createdAt?.gte && r.createdAt < where.createdAt.gte) return false;
      return true;
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Layer 1 — ReportRepository.getQCInspectionsForEmployeePerformance
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- Layer 1: ReportRepository.getQCInspectionsForEmployeePerformance ---');

await (async () => {
  const original = db.qCInspection.findMany.bind(db.qCInspection);
  (db.qCInspection as any).findMany = fakeQCInspectionFindMany(FIXTURE_INSPECTIONS);

  const repo = new ReportRepository();
  const from = daysAgo(365);

  const qiA = await repo.getQCInspectionsForEmployeePerformance('QI-A', from);
  assertTrue('QI-A: 5 inspection attempts returned', qiA.length === 5);

  const qiB = await repo.getQCInspectionsForEmployeePerformance('QI-B', from);
  assertTrue('QI-B: 1 inspection attempt returned', qiB.length === 1 && qiB[0].id === 'QCI-5');

  const noOne = await repo.getQCInspectionsForEmployeePerformance('QI-NOBODY', from);
  assertTrue('an inspector with zero attempts gets zero rows', noOne.length === 0);

  (db.qCInspection as any).findMany = original;
})();

// ═══════════════════════════════════════════════════════════════════════
// Layer 2 — ReportService.getEmployeePerformanceReport (end-to-end)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- Layer 2: ReportService.getEmployeePerformanceReport (end-to-end) ---');

await (async () => {
  const originalEmployeeFindMany = db.employee.findMany.bind(db.employee);
  const originalAttendanceCount = db.attendance.count.bind(db.attendance);
  const originalJobFindMany = db.job.findMany.bind(db.job);
  const originalLeadFindMany = db.lead.findMany.bind(db.lead);
  const originalInvoiceFindMany = db.invoice.findMany.bind(db.invoice);
  const originalQCFindMany = db.qCInspection.findMany.bind(db.qCInspection);

  // A control TECHNICIAN, with real job data, to prove the existing branch
  // is completely unaffected by this change.
  const FIXTURE_JOBS = [
    { id: 'TJ1', technicianId: 'TECH-1', serviceAdvisorId: null, customer: 'Anand', status: 'Delivered', reworkCount: 1, failedAt: new Date(), createdAt: daysAgo(4) },
  ];

  (db.employee as any).findMany = async () => ([
    { id: 'QI-A', name: 'Divya', role: 'QUALITY_INSPECTOR', franchise: { name: 'FRA001' } },
    { id: 'QI-B', name: 'Karthik', role: 'QUALITY_INSPECTOR', franchise: { name: 'FRA001' } },
    { id: 'TECH-1', name: 'Suresh', role: 'TECHNICIAN', franchise: { name: 'FRA001' } },
  ]);
  (db.attendance as any).count = async () => 0;
  (db.job as any).findMany = async (args: any) => {
    const where = args?.where ?? {};
    return FIXTURE_JOBS.filter((j) => {
      if (where.OR) {
        const matches = where.OR.some((cond: any) => (cond.technicianId && j.technicianId === cond.technicianId) || (cond.serviceAdvisorId && j.serviceAdvisorId === cond.serviceAdvisorId));
        if (!matches) return false;
      }
      return true;
    });
  };
  (db.lead as any).findMany = async () => [];
  (db.invoice as any).findMany = async () => [];
  (db.qCInspection as any).findMany = fakeQCInspectionFindMany(FIXTURE_INSPECTIONS);

  const service = new ReportService(new ReportRepository());
  const reports = await service.getEmployeePerformanceReport(undefined, 'annual');
  const qiAReport = reports.find((r: any) => r.employeeId === 'QI-A');
  const qiBReport = reports.find((r: any) => r.employeeId === 'QI-B');
  const techReport = reports.find((r: any) => r.employeeId === 'TECH-1');

  console.log('  QI-A report:', JSON.stringify(qiAReport?.jobs));
  console.log('  QI-B report:', JSON.stringify(qiBReport?.jobs));
  console.log('  TECH-1 report:', JSON.stringify(techReport?.jobs));

  assertTrue('QI-A: jobs.assigned = 5 (all attempts across J1/J2x2/J3/J4)', qiAReport?.jobs.assigned === 5);
  assertTrue('QI-A: jobs.completed = 4 (all decided attempts — J3 Pending excluded)', qiAReport?.jobs.completed === 4);
  assertTrue('QI-A: jobs.pending = 1 (J3, still Pending)', qiAReport?.jobs.pending === 1);
  assertTrue('QI-A: qcFailures = 1 (their own Failed decision on J2 attempt 1)', qiAReport?.jobs.qcFailures === 1);
  assertTrue('QI-A: reworkCount = 2 (J2 attempt 2 [own rework] + J4 attempt 2 [re-checking QI-B\'s failure])', qiAReport?.jobs.reworkCount === 2);

  assertTrue('QI-B: jobs.assigned = 1 (their single attempt on J4)', qiBReport?.jobs.assigned === 1);
  assertTrue('QI-B: qcFailures = 1 (they failed J4 attempt 1)', qiBReport?.jobs.qcFailures === 1);
  assertTrue('QI-B: reworkCount = 0 (their attempt was attemptNumber 1, not a re-inspection — the REWORK is attributed to QI-A who re-checked it, not blamed on QI-B for the ORIGINAL failure)', qiBReport?.jobs.reworkCount === 0);

  assertTrue('control TECHNICIAN: jobs.assigned still comes from Job.technicianId (1), completely unaffected by the QI branch', techReport?.jobs.assigned === 1);
  assertTrue('control TECHNICIAN: jobs.reworkCount still comes from Job.reworkCount (1), not QCInspection', techReport?.jobs.reworkCount === 1);
  assertTrue('control TECHNICIAN: qcFailures still comes from Job.failedAt (1), not QCInspection', techReport?.jobs.qcFailures === 1);

  (db.employee as any).findMany = originalEmployeeFindMany;
  (db.attendance as any).count = originalAttendanceCount;
  (db.job as any).findMany = originalJobFindMany;
  (db.lead as any).findMany = originalLeadFindMany;
  (db.invoice as any).findMany = originalInvoiceFindMany;
  (db.qCInspection as any).findMany = originalQCFindMany;
})();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
