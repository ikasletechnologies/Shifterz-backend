// EPB 2.6 / 5.12 / 5.13 — Finding B remediation verification.
//
// The EPB states this rule unconditionally, with no HQ/SUPER_ADMIN
// exception anywhere in the spec: "Employee records shall not be
// permanently deleted." §5.13's permission matrix shows "Delete Employee
// ❌ (Soft Delete Only)" for every role column, including HQ.
//
// Previously `DELETE /hq/deleted-records/employees/:id/permanent` ran a
// real `tx.employee.delete()` for any non-SUPER_ADMIN employee. This
// verifies that path is now removed (the endpoint always returns 400 for
// model === "employees"), that no other reachable code path in `src/`
// hard-deletes an Employee row, and that the pre-existing soft-delete /
// deactivation path (EmployeeService.deleteEmployee) is untouched.
//
// Structural source-text checks only — no live database connection in
// this sandbox (same limitation documented in
// scripts/test-epb2-1-3-remediation.ts). A real end-to-end run against a
// live database remains LIVE VERIFICATION PENDING and is not implied by
// this file passing.
//
// Run with: npx tsx scripts/test-epb2-6b-employee-permanent-delete-removed.ts
import fs from 'node:fs';
import path from 'node:path';

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

// ═══════════════════════════════════════════════════════════════════════
// hq.ts — the "employees" branch of the permanent-delete endpoint
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- hq.ts: DELETE /deleted-records/:model/:id/permanent ---');

const hqSource = src('src/routes/hq.ts');
const routeBody = body(
  hqSource,
  'hqRouter.delete("/deleted-records/:model/:id/permanent"',
  '\n});\n\n// Financial GST & Accounting CSV Export'
);

assertTrue('route handler was located', routeBody.length > 0 && routeBody.includes('/deleted-records/:model/:id/permanent'));
assertTrue('the whole route remains SUPER_ADMIN-gated', routeBody.includes('requireRole("SUPER_ADMIN")'));
assertTrue('an explicit "employees" branch exists', routeBody.includes('model === "employees"'));
assertTrue('the "employees" branch responds 400 (rejected, not processed)', /model === "employees"\)\s*{\s*res\.status\(400\)/.test(routeBody));
assertTrue('no employee hard-delete call remains anywhere in this route', !routeBody.includes('.employee.delete('));
assertTrue('no employee hard-delete transaction remains anywhere in this route', !routeBody.includes('tx.employee.delete'));
assertTrue('the removed reason is stated as unconditional, not "pending a safety policy" (that framing is reserved for customers/jobs/inventory)', (() => {
  const employeesBranch = body(routeBody, 'model === "employees"', 'model === "customers"');
  return employeesBranch.includes('must never be permanently deleted') && !employeesBranch.includes('pending a dedicated safety policy');
})());
assertTrue('customers/jobs/inventory permanent-delete remain disabled (unaffected by this fix)', routeBody.includes('model === "customers" || model === "jobs" || model === "inventory"'));
assertTrue('invoices permanent-delete path (a separate, already-guarded EPB 13.12 mechanism) is unaffected', routeBody.includes('model === "invoices"') && routeBody.includes('billingService.deleteInvoice'));
assertTrue('payments permanent-delete remains explicitly rejected (unaffected by this fix)', routeBody.includes('model === "payments"'));

// ═══════════════════════════════════════════════════════════════════════
// Repo-wide sweep — no reachable code path anywhere hard-deletes an Employee
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- Repo-wide sweep for db.employee.delete( / tx.employee.delete( ---');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      walk(full, out);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      out.push(full);
    }
  }
  return out;
}

const srcDir = path.join(process.cwd(), 'src');
const allFiles = walk(srcDir);
// Matches db.employee.delete( / tx.employee.delete( / anyPrismaClient.employee.delete( —
// a real Prisma hard-delete call. Does NOT match `.deleteEmployee(`, the
// unrelated soft-delete service/controller method name (different token:
// no ".employee.delete(" substring appears in "deleteEmployee(").
const offenders: string[] = [];
for (const file of allFiles) {
  const text = fs.readFileSync(file, 'utf-8');
  if (/[a-zA-Z_$][\w$]*\.employee\.delete\s*\(/.test(text)) {
    offenders.push(file);
  }
}
assertTrue(`no file under src/ contains a live db.employee.delete(/tx.employee.delete( call (found: ${offenders.length === 0 ? 'none' : offenders.join(', ')})`, offenders.length === 0);

// ═══════════════════════════════════════════════════════════════════════
// The existing soft-delete / deactivation path is untouched
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- EmployeeService.deleteEmployee (soft-delete) — unaffected ---');

const employeeServiceSource = src('src/modules/employee/service/employee.service.ts');
const deleteEmployeeBody = body(employeeServiceSource, 'async deleteEmployee(', '\n  async getPendingApprovals(');

assertTrue('deleteEmployee still blocks deleting a SUPER_ADMIN account', deleteEmployeeBody.includes('existing.role === "SUPER_ADMIN"'));
assertTrue('deleteEmployee still revokes active sessions on removal', deleteEmployeeBody.includes('db.session.updateMany'));
assertTrue('deleteEmployee still delegates to repository.softDelete (not a hard delete)', deleteEmployeeBody.includes('this.repository.softDelete(id)'));
assertTrue('deleteEmployee itself contains no hard-delete call', !deleteEmployeeBody.includes('.employee.delete('));

const employeeRepoSource = src('src/modules/employee/repository/employee.repository.ts');
assertTrue('EmployeeRepository.softDelete marks isDeleted/deletedAt (not a real delete)', employeeRepoSource.includes('async softDelete(') && /isDeleted:\s*true/.test(employeeRepoSource));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
