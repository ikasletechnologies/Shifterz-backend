// EPB §3.5 / §3.12 rule 6 / §4.13 rule 2 — Section 3 Finding 1 remediation.
//
// "HQ shall not create franchise branches directly... HQ shall submit a
// Franchise Activation Request... Once approved and activated by Ikasle,
// the franchise shall become available." Previously POST /hq/franchises
// created an immediately-"Active" franchise and license with no approval
// gate at all, while a separate, parallel /api/franchise implementation
// created a Pending Approval record that nothing ever processed — two
// divergent, neither-correct implementations.
//
// Interpretation (documented, not invented mid-code per the review's
// explicit instruction): this codebase has no "Ikasle" identity anywhere
// (no role, login, or model). SUPER_ADMIN — the system's singular,
// non-deletable, highest-trust identity — is used as the sole approving
// actor. HQ_USER may still submit (POST /franchises) but cannot approve
// or reject its own submission.
//
// This verifies:
//  - POST /hq/franchises creates Pending franchise+license, no admin.
//  - POST /hq/franchises/:id/approve exists, is SUPER_ADMIN-only, only
//    acts on a Pending franchise, flips both to Active, optionally
//    provisions the admin via the canonical createEmployee/
//    approveRegistration path, and audits both actions.
//  - POST /hq/franchises/:id/reject exists, is SUPER_ADMIN-only, requires
//    a reason, only acts on a Pending franchise, and audits it.
//  - PUT /hq/franchises/:id can no longer be used to bypass the gate (a
//    direct status change, or admin provisioning, on a Pending franchise
//    is rejected).
//  - GET /franchise-requests no longer unions in the dead Approval-table
//    rows.
//  - The old /api/franchise creation path is retired with a clear
//    redirect, not silently removed or left as a working duplicate.
//
// hq.ts's routes are inline anonymous Express handlers, not independently
// callable — verified structurally, same approach the existing
// scripts/test-epb2-3b-*.ts already uses for this exact file.
// FranchiseService.createFranchise IS an exported, callable method — its
// retirement is verified behaviorally (the real method is invoked, not a
// reimplementation).
//
// No live database connection in this sandbox — same limitation as every
// other scripts/test-epb*.ts file. A real end-to-end run against a live
// database remains LIVE VERIFICATION PENDING and is not implied by this
// file passing.
//
// Run with: npx tsx scripts/test-epb3-1-franchise-activation-governance.ts
import fs from 'node:fs';
import { FranchiseService } from '../src/modules/franchise/service/franchise.service.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}
async function assertRejectsWith(name: string, fn: () => Promise<unknown>, messageIncludes: string) {
  try {
    await fn();
    fail++; console.log(`FAIL: ${name} — expected a rejection containing "${messageIncludes}", but it resolved`);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    if (msg.includes(messageIncludes)) { pass++; console.log(`PASS: ${name}`); }
    else { fail++; console.log(`FAIL: ${name} — rejected, but with unexpected message: ${msg}`); }
  }
}

const root = (p: string) => new URL(`../${p}`, import.meta.url);
const src = (p: string) => fs.readFileSync(root(p), 'utf-8').replace(/\r\n/g, '\n');
function body(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) return '';
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end === -1 ? undefined : end);
}

const hqSource = src('src/routes/hq.ts');

// ═══════════════════════════════════════════════════════════════════════
// POST /hq/franchises/:id/approve
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- POST /hq/franchises/:id/approve ---');

const approveBody = body(hqSource, 'hqRouter.post("/franchises/:id/approve"', '\n// Reject a pending Franchise Activation Request');
assertTrue('route handler was located', approveBody.length > 0);
assertTrue('gated to SUPER_ADMIN only (registered on the route, in the marker line)', body(hqSource, 'hqRouter.post("/franchises/:id/approve"', '\n').includes('requireRole("SUPER_ADMIN")'));
assertTrue('only acts on a Pending franchise', approveBody.includes('existing.status !== "Pending"'));
assertTrue('flips the franchise to Active', /data:\s*\{\s*status:\s*"Active"/.test(approveBody));
assertTrue('flips the license to Active', /license\.updateMany[\s\S]{0,80}status:\s*"Active"/.test(approveBody));
assertTrue('writes a FRANCHISE APPROVE audit entry', /module:\s*"FRANCHISE"[\s\S]*?action:\s*"APPROVE"/.test(approveBody));
assertTrue('the audit entry captures a real pre-image (existing), not null', /oldValue:\s*existing,/.test(approveBody));
assertTrue('optionally provisions the admin via the canonical createEmployee path', approveBody.includes('employeeService.createEmployee('));
assertTrue('clears the Pending/Inactive franchise-employee default via the existing approveRegistration (no new mechanism invented)', approveBody.includes('employeeService.approveRegistration('));
assertTrue('writes an EMPLOYEE CREATE audit entry when an admin is provisioned', /module:\s*"EMPLOYEE"[\s\S]*?action:\s*"CREATE"/.test(approveBody));
assertTrue('checks admin username uniqueness before provisioning', approveBody.includes('existingUsername'));

// ═══════════════════════════════════════════════════════════════════════
// POST /hq/franchises/:id/reject
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- POST /hq/franchises/:id/reject ---');

const rejectBody = body(hqSource, 'hqRouter.post("/franchises/:id/reject"', '\n// List all franchises');
assertTrue('route handler was located', rejectBody.length > 0);
assertTrue('gated to SUPER_ADMIN only', body(hqSource, 'hqRouter.post("/franchises/:id/reject"', '\n').includes('requireRole("SUPER_ADMIN")'));
assertTrue('requires a mandatory reason', rejectBody.includes('A reason is required to reject a Franchise Activation Request'));
assertTrue('only acts on a Pending franchise', rejectBody.includes('existing.status !== "Pending"'));
assertTrue('flips status to Rejected (record kept, not deleted)', /status:\s*"Rejected"/.test(rejectBody));
assertTrue('writes a FRANCHISE REJECT audit entry', /module:\s*"FRANCHISE"[\s\S]*?action:\s*"REJECT"/.test(rejectBody));

// ═══════════════════════════════════════════════════════════════════════
// PUT /hq/franchises/:id — governance gate closes the direct-edit backdoor
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- PUT /hq/franchises/:id: Pending-status backdoor closed ---');

const putBody = body(hqSource, 'hqRouter.put("/franchises/:id"', '\n// Delete (deactivate) a franchise');
assertTrue('route handler was located', putBody.length > 0);
assertTrue('fetches the existing franchise before mutating (needed for the guard)', putBody.includes('const existingFranchise = await db.franchise.findUnique'));
assertTrue('blocks a direct status change away from Pending', putBody.includes('existingFranchise.status === "Pending" && status !== undefined && status !== "Pending"'));
assertTrue('the block message redirects to /approve or /reject', putBody.includes('POST /franchises/:id/approve or /reject'));
assertTrue('also blocks admin provisioning while Pending (no halfway-active admin login)', putBody.includes('existingFranchise.status === "Pending" && (adminUsername || adminPassword)'));
assertTrue('the block redirects admin provisioning to /approve', putBody.includes('Provision its Franchise Admin via POST /franchises/:id/approve'));
assertTrue('the audit entry now captures a real pre-image (existingFranchise), not null', /oldValue:\s*existingFranchise,/.test(putBody));

// ═══════════════════════════════════════════════════════════════════════
// GET /franchise-requests — dead Approval-table branch removed
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- GET /franchise-requests: dead branch removed ---');

const requestsBody = body(hqSource, 'hqRouter.get("/franchise-requests"', '\n\n\n// Franchise Performance Monitoring');
assertTrue('route handler was located', requestsBody.length > 0);
assertTrue('no longer queries the dead db.approval table for FRANCHISE rows', !requestsBody.includes('db.approval.findMany'));
assertTrue('still lists genuinely Pending franchises', requestsBody.includes('status: "Pending"'));

// ═══════════════════════════════════════════════════════════════════════
// The old /api/franchise creation path is retired, not left as a working
// duplicate — behavioral: the real, exported method is invoked directly.
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- FranchiseService.createFranchise: retired duplicate path ---');

await (async () => {
  const service = new FranchiseService();
  await assertRejectsWith(
    'calling the old create path now rejects and redirects to the canonical workflow',
    () => service.createFranchise({ name: 'Test Franchise' } as any, 'HQ_USER-1', 'Some HQ User'),
    'POST /api/hq/franchises'
  );
})();

const franchiseServiceSource = src('src/modules/franchise/service/franchise.service.ts');
assertTrue('no longer writes a db.approval row (the dead-end mechanism is gone, not just unreachable)', !franchiseServiceSource.includes('db.approval.create'));
assertTrue('updateFranchise (a working, non-duplicate concern) is untouched', franchiseServiceSource.includes('async updateFranchise(id: string, data: UpdateFranchiseDTO)'));
assertTrue('deleteFranchise (a working, non-duplicate concern) is untouched', franchiseServiceSource.includes('async deleteFranchise(id: string)'));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
