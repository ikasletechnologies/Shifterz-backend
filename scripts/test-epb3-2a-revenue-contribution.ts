// EPB §3.8/§10.11 — Section 3 Finding 2A remediation verification.
//
// getInvoicesForEmployeePerformance previously matched invoices via
// `OR: [{ id: { in: jobIds } }, { client: { in: customerNames } }]` —
// comparing Invoice.id (a different id namespace) against Job ids, a
// comparison that could never match, leaving the customer-name fallback as
// the entire real mechanism. That could both miss revenue (name mismatch)
// and OVER-count it (a different employee's job for the same customer, in
// the same window, still matched by name).
//
// Fixed to filter by Invoice.jobId — the real, populated-at-billing-time
// link (see billing.service.ts's createInvoice). A job-less invoice
// (legitimate — see billing.validation.ts's comment on manualGstRate) is
// now explicitly excluded rather than guessed at via customer name.
// Cancelled invoices are also now excluded.
//
// Two layers of real (not reimplemented) coverage:
//  1. ReportRepository.getInvoicesForEmployeePerformance — the actual
//     method, driven against a Prisma-where-clause-aware fake db.invoice
//     store (filters by jobId/isDeleted/status/date exactly like the real
//     Prisma call would), so this exercises the real query-building logic,
//     not a mirror of it.
//  2. ReportService.getEmployeePerformanceReport — the actual method, using
//     the REAL ReportRepository (not a fake), with only db.* calls
//     monkey-patched, exercising the full Employee -> Job -> Invoice ->
//     revenueContribution chain end-to-end.
//
// No live database connection in this sandbox. A real end-to-end run
// against a live database remains LIVE VERIFICATION PENDING and is not
// implied by this file passing.
//
// Run with: npx tsx scripts/test-epb3-2a-revenue-contribution.ts
import { ReportRepository } from '../src/modules/report/repository/report.repository.js';
import { ReportService } from '../src/modules/report/service/report.service.js';
import { db } from '../src/lib/db.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}

// ── Prisma-where-clause-aware fake invoice store ─────────────────────────
// Relative to "now" (not a hardcoded date) so this test doesn't silently
// start failing once the fixed calendar date it used to hardcode is in the
// past relative to whatever "today" actually is when the suite runs.
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const FIXTURE_INVOICES = [
  // EMP1's first visit — must be attributed to EMP1.
  { id: 'STZ-0001', jobId: 'J1', client: 'Ravi Kumar', amount: 5000, gst: 900, discount: 0, status: 'Paid', isDeleted: false, date: daysAgo(20) },
  // EMP2's job for the SAME customer — must NOT be attributed to EMP1.
  { id: 'STZ-0002', jobId: 'J2', client: 'Ravi Kumar', amount: 8000, gst: 0, discount: 0, status: 'Paid', isDeleted: false, date: daysAgo(19) },
  // EMP1's SECOND visit (same customer, different job) — must ALSO be attributed to EMP1.
  { id: 'STZ-0003', jobId: 'J3', client: 'Ravi Kumar', amount: 3000, gst: 0, discount: 0, status: 'Paid', isDeleted: false, date: daysAgo(10) },
  // Job-less invoice for the same customer — must NEVER be attributed to anyone via this path.
  { id: 'STZ-0004', jobId: null, client: 'Ravi Kumar', amount: 99999, gst: 0, discount: 0, status: 'Paid', isDeleted: false, date: daysAgo(15) },
  // EMP1's job, but the invoice was cancelled — must be excluded.
  { id: 'STZ-0005', jobId: 'J1', client: 'Ravi Kumar', amount: 50000, gst: 0, discount: 0, status: 'Cancelled', isDeleted: false, date: daysAgo(12) },
];

function fakeInvoiceFindMany(invoices: typeof FIXTURE_INVOICES) {
  return async (args: any) => {
    const where = args?.where ?? {};
    return invoices.filter((inv) => {
      if (where.jobId?.in && !where.jobId.in.includes(inv.jobId)) return false;
      if (where.isDeleted !== undefined && inv.isDeleted !== where.isDeleted) return false;
      if (where.status?.not !== undefined && inv.status === where.status.not) return false;
      if (where.date?.gte && inv.date < where.date.gte) return false;
      return true;
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Layer 1 — ReportRepository.getInvoicesForEmployeePerformance (real method)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- Layer 1: ReportRepository.getInvoicesForEmployeePerformance ---');

await (async () => {
  const original = db.invoice.findMany.bind(db.invoice);
  (db.invoice as any).findMany = fakeInvoiceFindMany(FIXTURE_INVOICES);

  const repo = new ReportRepository();
  const from = daysAgo(365);

  const emp1Invoices = await repo.getInvoicesForEmployeePerformance(['J1', 'J3'], from);
  assertTrue('EMP1 (jobs J1, J3): exactly 2 invoices returned (STZ-0001, STZ-0003)', emp1Invoices.length === 2);
  assertTrue('EMP1: includes the first-visit invoice (STZ-0001)', emp1Invoices.some((i: any) => i.id === 'STZ-0001'));
  assertTrue('EMP1: includes the second-visit invoice (STZ-0003)', emp1Invoices.some((i: any) => i.id === 'STZ-0003'));
  assertTrue('EMP1: does NOT include EMP2\'s job invoice for the same customer (STZ-0002)', !emp1Invoices.some((i: any) => i.id === 'STZ-0002'));
  assertTrue('EMP1: does NOT include the job-less invoice for the same customer (STZ-0004)', !emp1Invoices.some((i: any) => i.id === 'STZ-0004'));
  assertTrue('EMP1: does NOT include the cancelled invoice on their own job (STZ-0005)', !emp1Invoices.some((i: any) => i.id === 'STZ-0005'));

  const emp2Invoices = await repo.getInvoicesForEmployeePerformance(['J2'], from);
  assertTrue('EMP2 (job J2): exactly 1 invoice returned (STZ-0002)', emp2Invoices.length === 1 && emp2Invoices[0].id === 'STZ-0002');

  const noJobInvoices = await repo.getInvoicesForEmployeePerformance([], from);
  assertTrue('An employee with zero jobs gets zero invoices (explicit, not a silent fallback)', noJobInvoices.length === 0);

  (db.invoice as any).findMany = original;
})();

// ═══════════════════════════════════════════════════════════════════════
// Layer 2 — ReportService.getEmployeePerformanceReport (real method, real
// ReportRepository, only db.* mocked) — full Employee -> Job -> Invoice
// chain end-to-end.
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- Layer 2: ReportService.getEmployeePerformanceReport (end-to-end) ---');

await (async () => {
  const originalEmployeeFindMany = db.employee.findMany.bind(db.employee);
  const originalAttendanceCount = db.attendance.count.bind(db.attendance);
  const originalJobFindMany = db.job.findMany.bind(db.job);
  const originalLeadFindMany = db.lead.findMany.bind(db.lead);
  const originalInvoiceFindMany = db.invoice.findMany.bind(db.invoice);

  const FIXTURE_JOBS = [
    { id: 'J1', technicianId: 'EMP1', serviceAdvisorId: null, customer: 'Ravi Kumar', status: 'Delivered', reworkCount: 0, failedAt: null, createdAt: daysAgo(20) },
    { id: 'J2', technicianId: 'EMP2', serviceAdvisorId: null, customer: 'Ravi Kumar', status: 'Delivered', reworkCount: 0, failedAt: null, createdAt: daysAgo(19) },
    { id: 'J3', technicianId: 'EMP1', serviceAdvisorId: null, customer: 'Ravi Kumar', status: 'Delivered', reworkCount: 0, failedAt: null, createdAt: daysAgo(10) },
  ];

  (db.employee as any).findMany = async () => ([{ id: 'EMP1', name: 'Suresh', role: 'TECHNICIAN', franchise: { name: 'FRA001' } }]);
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
  (db.invoice as any).findMany = fakeInvoiceFindMany(FIXTURE_INVOICES);

  const service = new ReportService(new ReportRepository());
  const [empReport] = await service.getEmployeePerformanceReport(undefined, 'annual');

  assertTrue('report was generated for EMP1', empReport?.employeeId === 'EMP1');
  assertTrue('jobs.assigned counts EMP1\'s 2 jobs (J1, J3) — not EMP2\'s', empReport?.jobs.assigned === 2);
  assertTrue('revenueContribution correctly totals ONLY EMP1\'s own job invoices (5900 + 3000 = 8900), excluding EMP2\'s job, the job-less invoice, and the cancelled one', empReport?.revenueContribution === 8900);

  (db.employee as any).findMany = originalEmployeeFindMany;
  (db.attendance as any).count = originalAttendanceCount;
  (db.job as any).findMany = originalJobFindMany;
  (db.lead as any).findMany = originalLeadFindMany;
  (db.invoice as any).findMany = originalInvoiceFindMany;
})();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
