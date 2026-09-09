// EPB Section 2 — remediation verification for the three locked, ordered
// fixes:
//   2.10 Vehicle Delivery / Outpass — QC/invoice/payment gate must be exact
//        (not substring-matched), required (not defaulted to allow), and
//        re-run at approveOutpass() immediately before checkout.
//   2.6  Record Protection — no hard-delete after soft-delete.
//   2.3  Licensing — employee creation via transfer approval must go
//        through the same license-limit check as a direct create.
//
// There is no live database connection in this sandbox (Postgres is not
// running locally; same limitation the existing scripts/test-inv07-*.ts
// documents). Verification here is therefore split the same way the rest of
// this codebase already splits it:
//   (a) direct unit tests of the pure decision logic (deliveryGate.helper.ts,
//       EmployeeService.assertLicenseCapacity — the latter driven by
//       monkey-patching the two PrismaClient methods it calls, since
//       PrismaClient model delegates are plain mutable objects and no query
//       actually needs to reach a socket),
//   (b) structural source-text checks confirming call order and the absence
//       of the removed hard-delete calls.
// A real end-to-end run against a live database (actual HTTP request,
// actual Postgres row) remains LIVE VERIFICATION PENDING and is not implied
// by this file passing.
//
// Run with: npx tsx scripts/test-epb2-1-3-remediation.ts
import fs from 'node:fs';

import { assertJobQcPassed, assertInvoicePaidOrCredit } from '../src/modules/outpass/service/deliveryGate.helper.js';
import { EmployeeService } from '../src/modules/employee/service/employee.service.js';
import { db } from '../src/lib/db.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}
function assertThrows(name: string, fn: () => void) {
  try { fn(); fail++; console.log(`FAIL: ${name} — expected a throw`); }
  catch { pass++; console.log(`PASS: ${name}`); }
}
function assertDoesNotThrow(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`PASS: ${name}`); }
  catch (e) { fail++; console.log(`FAIL: ${name} — unexpected throw: ${e}`); }
}
async function assertRejects(name: string, fn: () => Promise<unknown>) {
  try { await fn(); fail++; console.log(`FAIL: ${name} — expected a rejection`); }
  catch { pass++; console.log(`PASS: ${name}`); }
}
async function assertResolves(name: string, fn: () => Promise<unknown>) {
  try { await fn(); pass++; console.log(`PASS: ${name}`); }
  catch (e) { fail++; console.log(`FAIL: ${name} — unexpected rejection: ${e}`); }
}

const root = (p: string) => new URL(`../${p}`, import.meta.url);
const src = (p: string) => fs.readFileSync(root(p), 'utf-8');
function body(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end === -1 ? undefined : end);
}

// ═══════════════════════════════════════════════════════════════════════
// 2.10 Vehicle Delivery / Outpass
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- 2.10 Vehicle Delivery / Outpass ---');

// QC Pending → BLOCK (status set, passedAt still null — the real shape a
// job has while sitting in QC review, per qc.service.ts before decide()).
assertThrows('QC Pending blocks (passedAt null)', () =>
  assertJobQcPassed({ status: 'QC Pending', passedAt: null }));

// QC Failed / Rework Required → BLOCK (qc.service.ts's decide() sets
// failedAt on a Failed result, never passedAt).
assertThrows('QC Failed / Rework Required blocks (passedAt null)', () =>
  assertJobQcPassed({ status: 'Rework Required', passedAt: null }));

// No job resolvable at all (previously silently skipped the whole gate).
assertThrows('missing job blocks outright (previously silently skipped)', () =>
  assertJobQcPassed(null));

// QC Passed → continue (qc.service.ts's decide() sets status "Ready For
// Billing" + passedAt on a Passed result).
assertDoesNotThrow('QC Passed continues (passedAt set)', () =>
  assertJobQcPassed({ status: 'Ready For Billing', passedAt: new Date() }));

// A status string merely containing "QC" must NOT satisfy the gate — this
// is the exact bug being fixed (old code used statusUpper.includes("QC")).
assertThrows('a status merely containing "QC" does not satisfy the gate', () =>
  assertJobQcPassed({ status: 'QC Pending Review', passedAt: null }));

const invoice = (overrides: Partial<{ id: string; amount: number; gst: number; discount: number; status: string }> = {}) => ({
  id: 'INV1', amount: 1000, gst: 180, discount: 0, status: 'Issued', ...overrides,
});

assertThrows('no invoice blocks (previously defaulted isCreditOrPaid = true)', () =>
  assertInvoicePaidOrCredit(null, 0));

assertThrows('unpaid invoice blocks', () =>
  assertInvoicePaidOrCredit(invoice(), 0));

assertDoesNotThrow('fully paid invoice continues', () =>
  assertInvoicePaidOrCredit(invoice(), 1180));

assertThrows('invoice not on approved credit and not paid blocks', () =>
  assertInvoicePaidOrCredit(invoice({ status: 'Issued' }), 0));

assertDoesNotThrow('invoice on explicitly approved credit continues (zero paid)', () =>
  assertInvoicePaidOrCredit(invoice({ status: 'Approved Credit' }), 0));

// Structural: approveOutpass must re-run the gate against fresh state
// BEFORE the outpass status flips to "Delivered" / the vehicle is marked
// "Out" — not trust whatever createOutpass decided at request time.
const outpassService = src('src/modules/outpass/service/outpass.service.ts');
const approveBody = body(outpassService, 'async approveOutpass(', 'async rejectOutpass(');
const gateIdx = approveBody.indexOf('assertDeliveryPrerequisites');
const deliveredIdx = approveBody.indexOf('status: "Delivered"');
const outIdx = approveBody.lastIndexOf('status: "Out"');
assertTrue('approveOutpass calls assertDeliveryPrerequisites', gateIdx !== -1);
assertTrue('the gate re-check happens BEFORE the outpass flips to "Delivered"', gateIdx !== -1 && deliveredIdx !== -1 && gateIdx < deliveredIdx);
assertTrue('the gate re-check happens BEFORE the vehicle/carIn flips to "Out"', gateIdx !== -1 && outIdx !== -1 && gateIdx < outIdx);
assertTrue('approveOutpass re-fetches job/invoice from the DB rather than trusting stale outpass fields', approveBody.includes('db.job.findUnique') || approveBody.includes('resolveJobForOutpass'));

// ═══════════════════════════════════════════════════════════════════════
// 2.6 Record Protection
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- 2.6 Record Protection ---');

const jobCardRepo = src('src/modules/job-card/repository/job-card.repository.ts');
const softDeleteBody = body(jobCardRepo, 'async softDelete(id: string)', '\n  }');
assertTrue('JobCardRepository.softDelete no longer hard-deletes the job (no db.job.delete)', !softDeleteBody.includes('db.job.delete'));
assertTrue('JobCardRepository.softDelete still marks isDeleted/deletedAt', softDeleteBody.includes('isDeleted: true') && softDeleteBody.includes('deletedAt'));
assertTrue('JobCardRepository.softDelete returns the update result (record remains queryable)', /return\s+await\s+db\.job\.update/.test(softDeleteBody));

const vehicleCheckinRepo = src('src/modules/vehicle-checkin/repository/vehicle-checkin.repository.ts');
const carInDeleteBody = body(vehicleCheckinRepo, 'async delete(id: string)', '// Related auto-creation methods');
assertTrue('VehicleCheckinRepository.delete (CarIn) no longer hard-deletes (no db.carIn.delete)', !carInDeleteBody.includes('db.carIn.delete'));
assertTrue('VehicleCheckinRepository.delete still marks isDeleted/deletedAt', carInDeleteBody.includes('isDeleted: true') && carInDeleteBody.includes('deletedAt'));

const deleteJobCardBody = body(vehicleCheckinRepo, 'async deleteJobCard(id: string)', 'async findCustomerByPhone');
assertTrue('VehicleCheckinRepository.deleteJobCard no longer hard-deletes (no db.job.delete)', !deleteJobCardBody.includes('db.job.delete'));
assertTrue('VehicleCheckinRepository.deleteJobCard still marks isDeleted/deletedAt', deleteJobCardBody.includes('isDeleted: true') && deleteJobCardBody.includes('deletedAt'));

const leadRepo = src('src/modules/lead/repository/lead.repository.ts');
const deleteCustomerBody = body(leadRepo, 'async deleteCustomer(id: string)', '\n}');
assertTrue('LeadRepository.deleteCustomer no longer hard-deletes (no db.customer.delete)', !deleteCustomerBody.includes('db.customer.delete'));
assertTrue('LeadRepository.deleteCustomer soft-deletes instead (isDeleted/deletedAt via db.customer.update)', deleteCustomerBody.includes('db.customer.update') && deleteCustomerBody.includes('isDeleted: true'));

// A ghost customer soft-deleted by the zero-visit cleanup (lead.service.ts)
// must become visible again if a later conversion re-links it — otherwise
// it would be an orphaned, permanently-invisible "deleted" record, which is
// exactly what 2.6 forbids.
const leadService = src('src/modules/lead/service/lead.service.ts');
const relinkBody = body(leadService, "} else if (!customer.convertedLeadId) {", '// Link lead');
assertTrue('re-linking a phone-matched customer during conversion un-hides it (isDeleted: false)', relinkBody.includes('isDeleted: false'));

// Confirm no OTHER live delete path in these three repositories still
// hard-deletes a business record (guards against a 4th unnoticed instance
// of the same bug pattern in the same files).
assertTrue('no remaining db.job.delete( call anywhere in job-card.repository.ts', !jobCardRepo.includes('db.job.delete('));
assertTrue('no remaining db.carIn.delete( or db.job.delete( call anywhere in vehicle-checkin.repository.ts', !vehicleCheckinRepo.includes('db.carIn.delete(') && !vehicleCheckinRepo.includes('db.job.delete('));

// ═══════════════════════════════════════════════════════════════════════
// 2.3 Licensing
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- 2.3 Licensing ---');

const employeeService = src('src/modules/employee/service/employee.service.ts');
assertTrue('EmployeeService exposes exactly one assertLicenseCapacity implementation (single licensing system)', (employeeService.match(/async assertLicenseCapacity/g) || []).length === 1);
assertTrue('createEmployee calls this.assertLicenseCapacity (direct-create path uses the canonical check)', body(employeeService, 'async createEmployee(', 'const rawPassword').includes('this.assertLicenseCapacity'));

const transferService = src('src/modules/employee/service/transfer.service.ts');
const approveTransferBody = body(transferService, 'async approveTransfer(', 'async rejectTransfer(');
assertTrue('TransferService does not reimplement its own license/count logic (no db.employee.count, no db.license.findFirst in this file)', !transferService.includes('db.employee.count') && !transferService.includes('db.license.findFirst'));
assertTrue('approveTransfer calls employeeService.assertLicenseCapacity for the new-member-creation path', approveTransferBody.includes('this.employeeService.assertLicenseCapacity'));
const capIdx = approveTransferBody.indexOf('assertLicenseCapacity');
const createIdx = approveTransferBody.indexOf('createEmployeeFromTransfer');
assertTrue('the license check runs BEFORE the employee is actually created (fails closed, not after the fact)', capIdx !== -1 && createIdx !== -1 && capIdx < createIdx);
const approvedIdx = approveTransferBody.lastIndexOf('updateRequestStatus(id, "Approved")');
assertTrue('the request is only marked "Approved" AFTER a successful license check + creation (a cap rejection leaves it retryable, not stuck)', capIdx !== -1 && approvedIdx !== -1 && capIdx < approvedIdx);

const transferController = src('src/modules/employee/controller/transfer.controller.ts');
assertTrue('approveTransfer audits the employee record it provisions (EPB 2.3 "ensure the operation is audited")', transferController.includes('logAudit') && transferController.includes('CREATE_FROM_TRANSFER'));

// Direct unit test of the shared license-cap logic itself, both branches
// (SUPER_ADMIN/HQ_USER global caps, and per-franchise caps) — driven by
// monkey-patching the two PrismaClient methods it reads, since no live
// database is reachable in this sandbox.
const employeeService_ = new EmployeeService();
const originalCount = db.employee.count.bind(db.employee);
const originalLicenseFindFirst = db.license.findFirst.bind(db.license);
function withCounts(count: number, license: any = null) {
  (db.employee as any).count = async () => count;
  (db.license as any).findFirst = async () => license;
}
function restoreDb() {
  (db.employee as any).count = originalCount;
  (db.license as any).findFirst = originalLicenseFindFirst;
}

await (async () => {
  try {
    withCounts(1); // already 1 Super Admin, default limit 1
    await assertRejects('assertLicenseCapacity blocks a 2nd SUPER_ADMIN at the default cap', () => employeeService_.assertLicenseCapacity('SUPER_ADMIN', null));

    withCounts(0);
    await assertResolves('assertLicenseCapacity allows the 1st SUPER_ADMIN under the cap', () => employeeService_.assertLicenseCapacity('SUPER_ADMIN', null));

    withCounts(6); // default HQ_USER limit
    await assertRejects('assertLicenseCapacity blocks a 7th HQ_USER at the default cap', () => employeeService_.assertLicenseCapacity('HQ_USER', null));

    withCounts(5);
    await assertResolves('assertLicenseCapacity allows the 6th HQ_USER under the cap', () => employeeService_.assertLicenseCapacity('HQ_USER', null));

    withCounts(1); // default FRANCHISE_ADMIN limit
    await assertRejects('assertLicenseCapacity blocks a 2nd FRANCHISE_ADMIN at the default cap', () => employeeService_.assertLicenseCapacity('FRANCHISE_ADMIN', 'F1'));

    withCounts(6); // default per-franchise user limit
    await assertRejects('assertLicenseCapacity blocks a 7th franchise user at the default cap', () => employeeService_.assertLicenseCapacity('TECHNICIAN', 'F1'));

    withCounts(5);
    await assertResolves('assertLicenseCapacity allows the 6th franchise user under the cap', () => employeeService_.assertLicenseCapacity('TECHNICIAN', 'F1'));

    // A custom License row's limits must be honored, not just the defaults.
    withCounts(3, { maxFranchiseUsers: 3, maxFranchiseAdmins: 1, maxHQUsers: 6, maxSuperAdmins: 1 });
    await assertRejects('assertLicenseCapacity honors a custom (lower) License.maxFranchiseUsers, not just the hardcoded default of 6', () => employeeService_.assertLicenseCapacity('TECHNICIAN', 'F1'));
  } finally {
    restoreDb();
  }
})();

// ═══════════════════════════════════════════════════════════════════════

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
