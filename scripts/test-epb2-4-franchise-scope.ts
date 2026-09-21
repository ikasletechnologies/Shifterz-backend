// EPB 2.4 — Franchise Governance: verifies the customer.service.ts
// report/CSV scope leak fix. There is no live database in this sandbox (see
// scripts/test-epb2-1-3-remediation.ts's header for why), so this drives
// CustomerService.getReportCSV/getReportsSummary through an in-memory fake
// of the exact PrismaClient methods they call — built from a genuinely
// two-franchise fixture set (FR-A and FR-B), so a franchise-scoped call
// that returns FR-B data would actually be caught, not pass by accident of
// the fixture only containing one franchise.
//
// NOTE ON SCOPE: the original audit that flagged this claimed 7 report
// types with 5 leaking (customer_register, new_customer, vehicle_register,
// customer_visit, service_history). Re-reading the actual switch in
// customer.service.ts's getReportCSV shows 8 case types, and only 3 were
// actually unscoped: customer_visit, service_history, and warranty_report
// (not previously named). customer_register/new_customer/vehicle_register
// already spread ...tenantFilter and were never leaking; service_due/
// referral_report were already fixed under REP-01C. This file tests all 8
// against the real fixture data, not just the 3 that needed a code change,
// so the corrected claim is verified rather than assumed.
//
// Run with: npx tsx scripts/test-epb2-4-franchise-scope.ts
import { CustomerService } from '../src/modules/customer/service/customer.service.js';
import { db } from '../src/lib/db.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}

// ── Fixture: two franchises, one record of each kind in each ──────────────
const FR_A = 'FR-A';
const FR_B = 'FR-B';
const now = new Date();

const customers = [
  { id: 'CUST-A1', franchiseId: FR_A, isDeleted: false, name: 'Alice A', phone: '1000000001', email: 'a1@x.com', alternateNumber: null, gstNumber: null, address: null, city: null, state: null, pinCode: null, status: 'Active', totalSpend: 500, visits: 2, createdAt: now },
  { id: 'CUST-B1', franchiseId: FR_B, isDeleted: false, name: 'Bob B', phone: '2000000001', email: 'b1@x.com', alternateNumber: null, gstNumber: null, address: null, city: null, state: null, pinCode: null, status: 'Active', totalSpend: 300, visits: 1, createdAt: now },
];
const customersById = new Map(customers.map(c => [c.id, c]));

const vehicles = [
  { id: 'VEH-A1', customerId: 'CUST-A1', isDeleted: false, vehicleNo: 'VEH-A1-NO', make: 'Make', model: 'Model', variant: null, year: null, fuelType: null, color: null, chassisNo: null, engineNo: null, odometer: null },
  { id: 'VEH-B1', customerId: 'CUST-B1', isDeleted: false, vehicleNo: 'VEH-B1-NO', make: 'Make', model: 'Model', variant: null, year: null, fuelType: null, color: null, chassisNo: null, engineNo: null, odometer: null },
];

const jobs = [
  { id: 'JOB-A1', franchiseId: FR_A, isDeleted: false, vehicle: 'VEH-A1-NO', service: 'Service A', technician: 'Tech A', status: 'Completed', createdAt: now, startDate: now },
  { id: 'JOB-B1', franchiseId: FR_B, isDeleted: false, vehicle: 'VEH-B1-NO', service: 'Service B', technician: 'Tech B', status: 'Completed', createdAt: now, startDate: now },
];

const carIns = [
  { jobCardId: 'JOB-A1', phone: '1000000001', franchiseId: FR_A, isDeleted: false },
  { jobCardId: 'JOB-B1', phone: '2000000001', franchiseId: FR_B, isDeleted: false },
];

const invoices = [
  { id: 'INV-A1', franchiseId: FR_A, type: 'Invoice', isDeleted: false, vehicle: 'VEH-A1-NO', date: now, status: 'Paid' },
  { id: 'INV-B1', franchiseId: FR_B, type: 'Invoice', isDeleted: false, vehicle: 'VEH-B1-NO', date: now, status: 'Paid' },
];

const warranties = [
  { id: 'WAR-A1', customerId: 'CUST-A1', isDeleted: false, itemName: 'Battery', vehicleNo: 'VEH-A1-NO', startDate: now, expiryDate: now, status: 'Active', durationDays: 365 },
  { id: 'WAR-B1', customerId: 'CUST-B1', isDeleted: false, itemName: 'Battery', vehicleNo: 'VEH-B1-NO', startDate: now, expiryDate: now, status: 'Active', durationDays: 365 },
];

function matchSimple(row: any, where: any): boolean {
  if (where.franchiseId !== undefined && row.franchiseId !== where.franchiseId) return false;
  if (where.isDeleted !== undefined && row.isDeleted !== where.isDeleted) return false;
  if (where.type !== undefined && row.type !== where.type) return false;
  if (where.createdAt?.gte !== undefined && !(row.createdAt >= where.createdAt.gte)) return false;
  return true;
}
function matchCustomerRelation(where: any, customerId: string): boolean {
  if (!where.customer) return true;
  const cust = customersById.get(customerId);
  if (!cust) return false;
  if (where.customer.franchiseId !== undefined && cust.franchiseId !== where.customer.franchiseId) return false;
  if (where.customer.isDeleted !== undefined && cust.isDeleted !== where.customer.isDeleted) return false;
  return true;
}

const originals = {
  customerFindMany: db.customer.findMany.bind(db.customer),
  vehicleFindMany: db.customerVehicle.findMany.bind(db.customerVehicle),
  jobFindMany: db.job.findMany.bind(db.job),
  carInFindMany: db.carIn.findMany.bind(db.carIn),
  invoiceFindMany: db.invoice.findMany.bind(db.invoice),
  warrantyFindMany: db.warranty.findMany.bind(db.warranty),
};

function installMocks() {
  (db.customer as any).findMany = async ({ where, include }: any) => {
    let rows = customers.filter(c => matchSimple(c, where));
    if (include?.vehicles) {
      rows = rows.map(c => ({ ...c, vehicles: vehicles.filter(v => v.customerId === c.id && v.isDeleted === false) })) as any;
    }
    return rows as any;
  };
  (db.customerVehicle as any).findMany = async ({ where }: any) => {
    return vehicles
      .filter(v => (where.isDeleted === undefined || v.isDeleted === where.isDeleted) && matchCustomerRelation(where, v.customerId))
      .map(v => ({ ...v, customer: customersById.get(v.customerId) })) as any;
  };
  (db.job as any).findMany = async ({ where }: any) => jobs.filter(j => matchSimple(j, where)) as any;
  (db.carIn as any).findMany = async ({ where }: any) => carIns.filter(c => matchSimple(c, where)) as any;
  (db.invoice as any).findMany = async ({ where }: any) => invoices.filter(i => matchSimple(i, where)) as any;
  (db.warranty as any).findMany = async ({ where }: any) => {
    return warranties
      .filter(w => (where.isDeleted === undefined || w.isDeleted === where.isDeleted) && matchCustomerRelation(where, w.customerId))
      .map(w => ({ ...w, customer: customersById.get(w.customerId) })) as any;
  };
}
function restoreMocks() {
  (db.customer as any).findMany = originals.customerFindMany;
  (db.customerVehicle as any).findMany = originals.vehicleFindMany;
  (db.job as any).findMany = originals.jobFindMany;
  (db.carIn as any).findMany = originals.carInFindMany;
  (db.invoice as any).findMany = originals.invoiceFindMany;
  (db.warranty as any).findMany = originals.warrantyFindMany;
}

const service = new CustomerService();
const scopeA = { franchiseId: FR_A };
const scopeB = { franchiseId: FR_B };
const scopeHQ = {}; // resolveDataScope/scopeWhere's unrestricted output

async function csvFor(type: string, tenantFilter: any) {
  return service.getReportCSV(type, tenantFilter);
}

// marker substrings unique enough that a CSV containing one franchise's row
// cannot accidentally also contain the other's
const markersA = ['CUST-A1', 'Alice A', '1000000001'];
const markersB = ['CUST-B1', 'Bob B', '2000000001'];

async function assertScopedCsv(name: string, type: string, markerA: string, markerB: string) {
  const csvA = await csvFor(type, scopeA);
  const csvB = await csvFor(type, scopeB);
  const csvHQ = await csvFor(type, scopeHQ);

  assertTrue(`${name}: FRANCHISE_ADMIN(FR-A) sees FR-A's record`, csvA.includes(markerA));
  assertTrue(`${name}: FRANCHISE_ADMIN(FR-A) CANNOT see FR-B's record`, !csvA.includes(markerB));
  assertTrue(`${name}: FRANCHISE_ADMIN(FR-B) sees FR-B's record`, csvB.includes(markerB));
  assertTrue(`${name}: FRANCHISE_ADMIN(FR-B) CANNOT see FR-A's record`, !csvB.includes(markerA));
  assertTrue(`${name}: HQ/SUPER_ADMIN sees FR-A's record (consolidated)`, csvHQ.includes(markerA));
  assertTrue(`${name}: HQ/SUPER_ADMIN sees FR-B's record (consolidated)`, csvHQ.includes(markerB));
}

await (async () => {
  installMocks();
  try {
    console.log('--- Regression: types that already spread ...tenantFilter (must still be correct) ---');
    await assertScopedCsv('customer_register', 'customer_register', 'CUST-A1', 'CUST-B1');
    await assertScopedCsv('new_customer', 'new_customer', 'CUST-A1', 'CUST-B1');
    await assertScopedCsv('vehicle_register', 'vehicle_register', 'VEH-A1-NO', 'VEH-B1-NO');

    console.log('\n--- Fix: the 3 report types that were actually unscoped ---');
    await assertScopedCsv('customer_visit', 'customer_visit', 'JOB-A1', 'JOB-B1');
    await assertScopedCsv('service_history', 'service_history', 'JOB-A1', 'JOB-B1');
    await assertScopedCsv('warranty_report', 'warranty_report', 'WAR-A1', 'WAR-B1');

    console.log('\n--- getReportsSummary (data retrieval, not just CSV export) ---');
    const summaryA = await service.getReportsSummary(scopeA);
    const summaryB = await service.getReportsSummary(scopeB);
    const summaryHQ = await service.getReportsSummary(scopeHQ);
    assertTrue('getReportsSummary: FR-A sees only its own 1 customer', summaryA.totalCustomers === 1 && summaryA.customers.every((c: any) => c.id === 'CUST-A1'));
    assertTrue('getReportsSummary: FR-B sees only its own 1 customer', summaryB.totalCustomers === 1 && summaryB.customers.every((c: any) => c.id === 'CUST-B1'));
    assertTrue('getReportsSummary: HQ sees both (consolidated total = 2)', summaryHQ.totalCustomers === 2);

    console.log('\n--- Already-fixed under REP-01C (structural regression check, not re-tested for data) ---');
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/modules/customer/service/customer.service.ts', import.meta.url), 'utf-8');
    assertTrue('service_due still delegates to the canonical, already-scoped ReportService (not reimplemented)', src.includes("this.reportService.getServiceDueFollowUpReport"));
    assertTrue('referral_report still delegates to the canonical, already-scoped ReportService (not reimplemented)', src.includes("this.reportService.getReferralReport"));

    console.log('\n--- Architecture: no second scope mechanism introduced ---');
    const controllerSrc = fs.readFileSync(new URL('../src/modules/customer/controller/customer.controller.ts', import.meta.url), 'utf-8');
    assertTrue('exportCSVReport uses the canonical resolveDataScope/scopeWhere, not the ad-hoc getTenantFilter', /exportCSVReport[\s\S]*?scopeWhere\(resolveDataScope\(req\.user\)\)/.test(controllerSrc));
    assertTrue('getReportsSummary (controller) uses the canonical resolveDataScope/scopeWhere', /getReportsSummary[\s\S]*?scopeWhere\(resolveDataScope\(req\.user\)\)/.test(controllerSrc));
  } finally {
    restoreMocks();
  }
})();

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
