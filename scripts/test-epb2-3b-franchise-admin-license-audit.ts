// EPB 2.3 / 2.13 — Finding A remediation verification (as later revised by
// Section 3 Finding 1 — see scripts/test-epb3-1-franchise-activation-governance.ts).
//
// Originally: POST /hq/franchises and PUT /hq/franchises/:id created a
// FRANCHISE_ADMIN employee via a raw tx.employee.create() call, bypassing
// EmployeeService.assertLicenseCapacity() and writing no audit entry for
// either the franchise mutation or the embedded employee creation
// (Section 2 Fix A).
//
// Section 3 Finding 1 then restructured POST /hq/franchises into a pure
// Franchise Activation Request submission (Pending, no admin — the EPB's
// own Activation Request field list has no admin-credential field) and
// moved admin provisioning to the new POST /franchises/:id/approve
// (SUPER_ADMIN only). This file now verifies POST's NEW, narrower
// responsibility; PUT's admin-provisioning path (for a franchise that
// already has none) is unchanged and still verified here.
//
// Structural source-text checks only — no live database connection in
// this sandbox (same limitation documented in
// scripts/test-epb2-1-3-remediation.ts and test-epb2-6b-*.ts). A real
// end-to-end run against a live database (actual HTTP request, actual
// Postgres rows for franchise + license + employee + two audit entries)
// remains LIVE VERIFICATION PENDING and is not implied by this file passing.
//
// Run with: npx tsx scripts/test-epb2-3b-franchise-admin-license-audit.ts
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
  if (start === -1) return '';
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end === -1 ? undefined : end);
}

const hqSource = src('src/routes/hq.ts');

// ═══════════════════════════════════════════════════════════════════════
// POST /hq/franchises
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- POST /hq/franchises (now: submission only, per Section 3 Finding 1) ---');

const postBody = body(hqSource, 'hqRouter.post("/franchises"', '\n// Approve a pending Franchise Activation Request');
assertTrue('route handler was located', postBody.length > 0);
assertTrue('no direct employee-creation Prisma call remains in this route', !/[a-zA-Z_$][\w$]*\.employee\.create\s*\(/.test(postBody));
assertTrue('no longer provisions an admin here — moved to /approve (Section 3 Finding 1)', !postBody.includes('employeeService.createEmployee('));
assertTrue('the franchise is created Pending, not Active (awaits SUPER_ADMIN approval)', /status:\s*"Pending"/.test(postBody));
assertTrue('the license is created Pending, not Active (awaits SUPER_ADMIN approval)', /license\.status\s*=\s*"Pending"|status:\s*"Pending"[\s\S]{0,300}organizationId/.test(postBody) || postBody.includes('status: "Pending"'));
assertTrue('writes a FRANCHISE CREATE audit entry', /module:\s*"FRANCHISE"[\s\S]*?action:\s*"CREATE"/.test(postBody));
assertTrue('the franchise-creation transaction contains no employee-creation logic', (() => {
  const txBody = body(postBody, 'await db.$transaction(async (tx)', 'return { newFranchise: franchise, newLicense: license };');
  return txBody.length > 0 && !txBody.includes('employee.create');
})());

// ═══════════════════════════════════════════════════════════════════════
// PUT /hq/franchises/:id
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- PUT /hq/franchises/:id ---');

const putBody = body(hqSource, 'hqRouter.put("/franchises/:id"', '\n// Delete (deactivate) a franchise');
assertTrue('route handler was located', putBody.length > 0);
assertTrue('no direct employee-creation Prisma call remains in this route', !/[a-zA-Z_$][\w$]*\.employee\.create\s*\(/.test(putBody));
assertTrue('delegates admin creation to the canonical EmployeeService.createEmployee', putBody.includes('employeeService.createEmployee('));
assertTrue('passes role: "FRANCHISE_ADMIN" through the canonical path', /role:\s*"FRANCHISE_ADMIN"/.test(putBody));
assertTrue('immediately clears the Pending/Inactive default via the existing approveRegistration', putBody.includes('employeeService.approveRegistration('));
assertTrue('writes a FRANCHISE audit entry', /module:\s*"FRANCHISE"[\s\S]*?action:\s*"UPDATE"/.test(putBody));
assertTrue('writes an EMPLOYEE audit entry for the newly-provisioned admin', /module:\s*"EMPLOYEE"[\s\S]*?action:\s*"CREATE"/.test(putBody));
assertTrue('new-admin creation only runs when no admin already exists (existingAdminBefore gate preserved)', putBody.includes('!existingAdminBefore && adminUsername && adminPassword'));
assertTrue('updating an existing admin\'s credentials still happens inside the transaction (unrelated to the license check, behavior preserved)', (() => {
  const txBody = body(putBody, 'await db.$transaction(async (tx)', 'return franchise;');
  return txBody.length > 0 && txBody.includes('tx.employee.update({ where: { id: existingAdminBefore.id }');
})());
assertTrue('the update-franchise transaction no longer contains employee-creation logic', (() => {
  const txBody = body(putBody, 'await db.$transaction(async (tx)', 'return franchise;');
  return txBody.length > 0 && !txBody.includes('employee.create');
})());

// ═══════════════════════════════════════════════════════════════════════
// Repo-wide sweep — confirms the only remaining employee-creation Prisma
// calls are the ones already covered by test-epb2-1-3-remediation.ts
// (repository layer), not a route bypassing the canonical service.
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- Repo-wide sweep: direct employee.create( calls ---');

// Strips `//` line comments first — hq.ts legitimately still documents the
// PRE-Fix-A removal of a different direct employee.create() call (the
// POST /hq/users fix, unrelated to this one) in prose, which must not
// false-positive against this check the way it would against a raw
// substring search.
// Normalize CRLF first — this repo's working tree uses CRLF line endings,
// and a bare `.replace(/\/\/.*$/, '')` per line silently never matches when
// a trailing \r sits after the content (`.` doesn't match \r, so `$`
// — anchored to the true end of the per-line string — can never be reached).
const hqSourceCodeOnly = hqSource
  .replace(/\r\n/g, '\n')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');
const employeeCreateCalls = [...hqSourceCodeOnly.matchAll(/[a-zA-Z_$][\w$]*\.employee\.create\s*\(/g)];
assertTrue(`src/routes/hq.ts contains zero direct employee.create( calls outside comments (found: ${employeeCreateCalls.length})`, employeeCreateCalls.length === 0);

// ═══════════════════════════════════════════════════════════════════════
// assertLicenseCapacity itself is untouched (Fix A must not weaken it or
// introduce a second implementation)
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- EmployeeService.assertLicenseCapacity — unweakened, single implementation ---');

const employeeServiceSource = src('src/modules/employee/service/employee.service.ts');
const assertLicenseCapacityOccurrences = [...employeeServiceSource.matchAll(/async assertLicenseCapacity\(/g)];
assertTrue('exactly one assertLicenseCapacity implementation exists in EmployeeService', assertLicenseCapacityOccurrences.length === 1);
assertTrue('createEmployee still calls this.assertLicenseCapacity (Fix A did not bypass it for the normal path)', employeeServiceSource.includes('await this.assertLicenseCapacity(roleToCheck, franchiseId);'));

const licenseCapacityBody = body(employeeServiceSource, 'async assertLicenseCapacity(', '\n  async createEmployee(');
assertTrue('still enforces the Franchise Administrator cap', licenseCapacityBody.includes('roleToCheck === "FRANCHISE_ADMIN"') && licenseCapacityBody.includes('limitFranchiseAdmins'));
// A precise structural check (not a bare occurrence count of a common field
// name like "maxFranchiseAdmins", which legitimately also appears where
// hq.ts sets a new License's default or handles a license-limits update):
// hq.ts must not itself count existing FRANCHISE_ADMIN employees against a
// limit — that specific shape is exactly what assertLicenseCapacity does,
// and duplicating it here would be a second, divergent implementation.
assertTrue('no repo-local reimplementation of a franchise-admin count/limit check exists in hq.ts', !/employee\.count\(\s*\{\s*where:\s*\{\s*franchiseId,\s*role:\s*"FRANCHISE_ADMIN"/.test(hqSource));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
