// EPB §18 — Finding D remediation verification.
//
// "Services shall not be permanently deleted if transactions exist." The
// DELETE /hq/services/master/:id route previously ran an unconditional
// tx.serviceMaster.delete() with no check at all for whether the service
// was referenced anywhere.
//
// Investigation before writing this fix (documented in hq.ts's own comment
// above findServiceMasterReference) confirmed ServiceMaster has no enforced
// foreign key anywhere, and — contrary to what the finding's phrasing might
// suggest — is not actually read by Job/Invoice/Estimate at all today; the
// real "Service Master" those flows select from is the separate `Service`
// model (src/modules/service/), which already soft-deletes. This test
// verifies both halves of that: the guard function itself works correctly
// against the loose name/id reference shapes that DO exist in this schema
// (Job.service / Job.services / Invoice.items / InvoiceLine.serviceId /
// Estimate.items), and the DELETE route's control flow actually calls it,
// in the right order, without disturbing the existing SUPER_ADMIN gate,
// mandatory reason, or audit-before-delete transaction.
//
// The reference-guard function itself is exercised with real logic against
// monkey-patched db.job/invoice/invoiceLine/estimate methods (same
// technique scripts/test-epb2-13-audit-gaps.ts already uses for
// db.auditLog.create) — this is genuine behavioral coverage of
// findServiceMasterReference, not just a source-text check. The route
// handler's own wiring (does it call the guard, in what order, does it
// preserve the existing audit/transaction shape) is verified structurally,
// since the handler itself is an inline anonymous Express callback, not an
// exported, independently-callable unit.
//
// No live database connection in this sandbox (same limitation documented
// in every other scripts/test-epb2-*.ts file in this batch). A real
// end-to-end run against a live database remains LIVE VERIFICATION PENDING
// and is not implied by this file passing.
//
// Run with: npx tsx scripts/test-epb2-18-servicemaster-reference-guard.ts
import fs from 'node:fs';
import { findServiceMasterReference } from '../src/routes/hq.js';
import { db } from '../src/lib/db.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}
async function assertResolvesTo<T>(name: string, fn: () => Promise<T>, expected: T) {
  try {
    const actual = await fn();
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) { pass++; console.log(`PASS: ${name}`); }
    else { fail++; console.log(`FAIL: ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
  } catch (e) {
    fail++; console.log(`FAIL: ${name} — unexpected throw: ${e}`);
  }
}

const root = (p: string) => new URL(`../${p}`, import.meta.url);
const src = (p: string) => fs.readFileSync(root(p), 'utf-8');
function body(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) return '';
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end === -1 ? undefined : end);
}

const SM = { id: 'SM1', code: 'SVC-CERAMIC', name: 'Ceramic Coating' };

function installFakes(overrides: {
  jobs?: any[];
  invoices?: any[];
  invoiceLine?: any | null;
  estimates?: any[];
}) {
  const originals = {
    jobFindMany: db.job.findMany.bind(db.job),
    invoiceFindMany: db.invoice.findMany.bind(db.invoice),
    invoiceLineFindFirst: db.invoiceLine.findFirst.bind(db.invoiceLine),
    estimateFindMany: db.estimate.findMany.bind(db.estimate),
  };
  (db.job as any).findMany = async () => overrides.jobs ?? [];
  (db.invoice as any).findMany = async () => overrides.invoices ?? [];
  (db.invoiceLine as any).findFirst = async () => overrides.invoiceLine ?? null;
  (db.estimate as any).findMany = async () => overrides.estimates ?? [];
  return () => {
    (db.job as any).findMany = originals.jobFindMany;
    (db.invoice as any).findMany = originals.invoiceFindMany;
    (db.invoiceLine as any).findFirst = originals.invoiceLineFindFirst;
    (db.estimate as any).findMany = originals.estimateFindMany;
  };
}

// ═══════════════════════════════════════════════════════════════════════
// findServiceMasterReference — behavioral coverage
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- findServiceMasterReference: unused service → deletion remains possible ---');

await (async () => {
  const restore = installFakes({ jobs: [], invoices: [], invoiceLine: null, estimates: [] });
  await assertResolvesTo('no references anywhere → null (delete allowed)', () => findServiceMasterReference(SM), null);
  restore();
})();

await (async () => {
  // Data exists, but none of it matches this service's name/id/code.
  const restore = installFakes({
    jobs: [{ id: 'J1', service: 'Full Body Wash', services: [{ name: 'Interior Detailing', price: 500 }] }],
    invoices: [{ id: 'I1', items: [{ name: 'Full Body Wash', price: 300 }] }],
    invoiceLine: null,
    estimates: [{ id: 'E1', items: [{ name: 'PPF Installation', price: 20000 }] }],
  });
  await assertResolvesTo('unrelated data present, no name/id match → null (delete allowed)', () => findServiceMasterReference(SM), null);
  restore();
})();

console.log('\n--- findServiceMasterReference: referenced service → deletion rejected ---');

await (async () => {
  const restore = installFakes({ jobs: [{ id: 'J2', service: 'Ceramic Coating', services: null }] });
  await assertResolvesTo('Job.service (singular field) exact match blocks', () => findServiceMasterReference(SM), { model: 'Job', id: 'J2' });
  restore();
})();

await (async () => {
  const restore = installFakes({ jobs: [{ id: 'J3', service: 'Unrelated', services: [{ name: 'Ceramic Coating', price: 8000 }] }] });
  await assertResolvesTo('Job.services JSON line-item name match blocks', () => findServiceMasterReference(SM), { model: 'Job', id: 'J3' });
  restore();
})();

await (async () => {
  const restore = installFakes({ jobs: [{ id: 'J4', service: '  ceramic coating  ', services: null }] });
  await assertResolvesTo('name matching is case/whitespace-insensitive', () => findServiceMasterReference(SM), { model: 'Job', id: 'J4' });
  restore();
})();

await (async () => {
  const restore = installFakes({ invoices: [{ id: 'INV1', items: [{ name: 'Ceramic Coating', price: 8000 }] }] });
  await assertResolvesTo('Invoice.items JSON line-item name match blocks', () => findServiceMasterReference(SM), { model: 'Invoice', id: 'INV1' });
  restore();
})();

await (async () => {
  const restore = installFakes({ invoiceLine: { id: 'IL1' } });
  await assertResolvesTo('InvoiceLine.serviceId match (id or code) blocks', () => findServiceMasterReference(SM), { model: 'InvoiceLine', id: 'IL1' });
  restore();
})();

await (async () => {
  const restore = installFakes({ estimates: [{ id: 'EST1', items: [{ name: 'Ceramic Coating', price: 8000 }] }] });
  await assertResolvesTo('Estimate.items JSON line-item name match blocks', () => findServiceMasterReference(SM), { model: 'Estimate', id: 'EST1' });
  restore();
})();

// ═══════════════════════════════════════════════════════════════════════
// Route wiring — structural checks on DELETE /hq/services/master/:id
// ═══════════════════════════════════════════════════════════════════════

console.log('\n--- DELETE /hq/services/master/:id: route wiring ---');

const hqSourceRaw = src('src/routes/hq.ts');
const hqSource = hqSourceRaw.replace(/\r\n/g, '\n');
const routeBody = body(hqSource, 'hqRouter.delete("/services/master/:id"', '\n\n// ═══');

assertTrue('route handler was located', routeBody.length > 0);
assertTrue('remains SUPER_ADMIN-gated', routeBody.includes('requireRole("SUPER_ADMIN")'));
assertTrue('a reason is still mandatory', routeBody.includes('A reason is required to permanently delete a Service Master entry'));
assertTrue('calls the reference guard before deciding to delete', routeBody.includes('findServiceMasterReference(existing)'));
assertTrue('rejects with a clear business error (400) when referenced', /reference\)\s*\{\s*res\.status\(400\)/.test(routeBody));
assertTrue('the rejection message names the model and record so it is auditable/actionable', routeBody.includes('${reference.model} record (${reference.id})'));

// Ordering: existing lookup → reference check → transaction (audit write
// then delete). The pre-delete snapshot (existing) must still be captured
// BEFORE the delete, and the audit write must still happen inside the same
// transaction as the delete (Item #3's original "either both happen or
// neither" guarantee, untouched by this fix).
const existingIdx = routeBody.indexOf('const existing = await db.serviceMaster.findUnique');
const referenceIdx = routeBody.indexOf('findServiceMasterReference(existing)');
const txIdx = routeBody.indexOf('await db.$transaction(async (tx)');
const auditIdx = routeBody.indexOf('tx.auditLog.create(');
const deleteIdx = routeBody.indexOf('tx.serviceMaster.delete(');

assertTrue('existing lookup happens before the reference check', existingIdx !== -1 && referenceIdx !== -1 && existingIdx < referenceIdx);
assertTrue('the reference check happens before the delete transaction opens', referenceIdx !== -1 && txIdx !== -1 && referenceIdx < txIdx);
assertTrue('the audit pre-image write still happens before the delete, inside the same transaction', auditIdx !== -1 && deleteIdx !== -1 && auditIdx < deleteIdx);
assertTrue('the audit entry still captures the full pre-delete snapshot as oldValue', routeBody.includes('oldValue: JSON.parse(JSON.stringify(existing))'));
assertTrue('the audit entry still captures the deletion reason as newValue', routeBody.includes('newValue: { reason }'));

console.log('\n--- No duplicate ServiceMaster deletion mechanism introduced ---');
const serviceMasterDeleteCalls = [...hqSource.matchAll(/[a-zA-Z_$][\w$]*\.serviceMaster\.delete\s*\(/g)];
assertTrue('exactly one tx.serviceMaster.delete( call exists in hq.ts', serviceMasterDeleteCalls.length === 1);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      walk(full, out);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      out.push(full);
    }
  }
  return out;
}

const srcRoot = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const allSrcFiles = walk(srcRoot);
const filesTouchingServiceMaster = allSrcFiles.filter((file) => {
  const text = fs.readFileSync(file, 'utf-8').replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  return /[a-zA-Z_$][\w$]*\.serviceMaster\./.test(text);
});
const relative = filesTouchingServiceMaster.map((f) => f.replace(srcRoot + '/', 'src/'));
assertTrue(
  `ServiceMaster is touched only from src/routes/hq.ts — no parallel deletion path elsewhere (found: ${relative.join(', ') || 'none'})`,
  relative.length === 1 && relative[0] === 'src/routes/hq.ts'
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
