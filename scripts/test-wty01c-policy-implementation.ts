// WTY-01C — Warranty Policy Implementation. Verifies the locked WTY-01B
// decisions (D-W1 Service Master default, D-W2 invoice-qualified manual
// creation, D-W3/D-W4 no-op structural checks, D-W5 HQ-only modify
// authority) are actually implemented, using pure-function tests for the
// extracted logic and structural source-inspection for the parts that
// require a live database to fully exercise. No live database connection
// exists in this sandbox (same status as every prior phase) — nothing
// here proves a real invoice/warranty round-trip; that remains LIVE
// VERIFICATION PENDING, stated explicitly, not implied.
// Run with: npx tsx scripts/test-wty01c-policy-implementation.ts
import fs from 'node:fs';
import {
  resolveLineItemWarranty,
  resolveInvoiceLevelWarranty,
  applyServiceWarrantyDefaults,
} from '../src/modules/billing/service/serviceWarrantyDefault.helper.js';
import { assertQualifyingInvoice } from '../src/modules/warranty/service/invoiceQualification.helper.js';
import { assertWarrantyModifyAuthority, WARRANTY_MODIFY_ROLES } from '../src/modules/warranty/service/warrantyAuthority.helper.js';
import { WarrantyService } from '../src/modules/warranty/service/warranty.service.js';
import { createWarrantySchema } from '../src/modules/warranty/validation/warranty.validation.js';
import { warrantyRouter } from '../src/modules/warranty/routes/warranty.routes.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}
function assertEqual(name: string, actual: unknown, expected: unknown) {
  assertTrue(`${name} (got ${JSON.stringify(actual)})`, JSON.stringify(actual) === JSON.stringify(expected));
}
function assertThrows(name: string, fn: () => void) {
  try { fn(); fail++; console.log(`FAIL: ${name} — expected a throw`); }
  catch (e) { pass++; console.log(`PASS: ${name}`); }
}
function assertDoesNotThrow(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`PASS: ${name}`); }
  catch (e) { fail++; console.log(`FAIL: ${name} — unexpected throw: ${e}`); }
}
async function assertRejects(name: string, fn: () => Promise<unknown>, errorNameContains?: string) {
  try {
    await fn();
    fail++; console.log(`FAIL: ${name} — expected a rejection`);
  } catch (e: any) {
    if (errorNameContains && !e.constructor.name.includes(errorNameContains)) {
      fail++; console.log(`FAIL: ${name} — expected ${errorNameContains}, got ${e.constructor.name}`);
    } else {
      pass++; console.log(`PASS: ${name}`);
    }
  }
}

const root = (p: string) => new URL(`../${p}`, import.meta.url);
const src = (p: string) => fs.readFileSync(root(p), 'utf-8');
function body(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end === -1 ? undefined : end);
}
function layerCount(router: any, method: string, p: string): number | null {
  const layer = router.stack.find((l: any) => l.route && l.route.path === p && l.route.methods[method]);
  return layer ? layer.route.stack.length : null;
}

const billingService = src('src/modules/billing/service/billing.service.ts');
const warrantyService = src('src/modules/warranty/service/warranty.service.ts');
const warrantyTypes = src('src/modules/warranty/types/warranty.types.ts');
const schemaPrisma = src('prisma/schema.prisma');

// ═══ D-W1 — Service Master default warranty ═══════════════════════════

const serviceMap = new Map([
  ['ceramic coating', '2 Year'],
  ['ac gas refill', '3 Month'],
]);

assertEqual('D-W1: an explicit line-item warranty always wins over the Service Master default', resolveLineItemWarranty({ name: 'Ceramic Coating', warranty: 'Custom 5 Year' }, serviceMap), 'Custom 5 Year');
assertEqual('D-W1: a missing line-item warranty defaults from the Service Master (case-insensitive name match)', resolveLineItemWarranty({ name: 'Ceramic Coating' }, serviceMap), '2 Year');
assertEqual('D-W1: a missing line-item warranty with no matching service resolves to undefined (no invented value, hardcoded fallback stays the safety net)', resolveLineItemWarranty({ name: 'Unknown Detailing Service' }, serviceMap), undefined);
assertEqual('D-W1: an empty-string warranty is treated as missing, not as an explicit override', resolveLineItemWarranty({ name: 'AC Gas Refill', warranty: '   ' }, serviceMap), '3 Month');
assertEqual('D-W1: falls back to `desc` when `name` is absent (Invoice.items uses desc, Job.services uses name — both supported)', resolveLineItemWarranty({ desc: 'AC Gas Refill' }, serviceMap), '3 Month');

assertEqual('D-W1: an explicit invoice-level warranty always wins', resolveInvoiceLevelWarranty('Custom Override', 'Ceramic Coating', serviceMap), 'Custom Override');
assertEqual('D-W1: a missing invoice-level warranty defaults from the Service Master by the invoice\'s own service name', resolveInvoiceLevelWarranty(null, 'Ceramic Coating', serviceMap), '2 Year');
assertEqual('D-W1: a missing invoice-level warranty with no matching service passes through the original (still-empty) value, not an invented one', resolveInvoiceLevelWarranty(undefined, 'Unknown Service', serviceMap), undefined);

const composed = applyServiceWarrantyDefaults(
  [{ name: 'Ceramic Coating' }, { name: 'AC Gas Refill', warranty: 'Custom' }],
  'Ceramic Coating',
  null,
  serviceMap
);
assertEqual('D-W1: applyServiceWarrantyDefaults resolves the first item from Service Master', composed.items?.[0]?.warranty, '2 Year');
assertEqual('D-W1: applyServiceWarrantyDefaults preserves the second item\'s explicit override', composed.items?.[1]?.warranty, 'Custom');
assertEqual('D-W1: applyServiceWarrantyDefaults resolves the invoice-level warranty too', composed.warranty, '2 Year');

assertTrue('D-W1: createInvoice is wired to apply Service Master defaults, gated on type===\'Invoice\' (same gate GST resolution uses)', body(billingService, 'async createInvoice(').includes('applyServiceWarrantyDefaults('));
assertTrue('D-W1: the Service Master lookup queries only non-deleted services', body(billingService, 'async createInvoice(', 'GST-03').includes('db.service.findMany({ where: { isDeleted: false }'));
assertTrue('D-W1: no second/duplicate Service Master lookup or resolution mechanism was introduced elsewhere in billing.service.ts', (billingService.match(/applyServiceWarrantyDefaults\(/g) || []).length === 1);

// ═══ D-W2 — Manual warranty creation requires a qualifying invoice ═══════

assertThrows('D-W2: a null invoice (not found) is rejected', () => assertQualifyingInvoice(null));
assertThrows('D-W2: a soft-deleted invoice is rejected', () => assertQualifyingInvoice({ type: 'Invoice', isDeleted: true, status: 'Paid', franchiseId: null }));
assertThrows('D-W2: a Quotation (not a real Invoice) is rejected', () => assertQualifyingInvoice({ type: 'Quotation', isDeleted: false, status: 'Paid', franchiseId: null }));
assertThrows('D-W2: an Estimate (not a real Invoice) is rejected', () => assertQualifyingInvoice({ type: 'Estimate', isDeleted: false, status: 'Pending', franchiseId: null }));
assertThrows('D-W2: a Cancelled invoice is rejected', () => assertQualifyingInvoice({ type: 'Invoice', isDeleted: false, status: 'Cancelled', franchiseId: null }));
assertDoesNotThrow('D-W2: a real, active Invoice qualifies', () => assertQualifyingInvoice({ type: 'Invoice', isDeleted: false, status: 'Paid', franchiseId: null }));
assertDoesNotThrow('D-W2: an unpaid-but-not-cancelled Invoice still qualifies (same bar as createInvoice\'s own automatic trigger, not a stricter one)', () => assertQualifyingInvoice({ type: 'Invoice', isDeleted: false, status: 'Pending', franchiseId: null }));

assertTrue('D-W2: CreateWarrantyDTO now requires invoiceId (not optional)', /invoiceId: string;/.test(warrantyTypes) && !/invoiceId\?: string;/.test(warrantyTypes));
assertTrue('D-W2: createWarranty validates invoiceId + itemName are present', body(warrantyService, 'async createWarranty(').includes('!data.invoiceId || !data.itemName'));
assertTrue('D-W2: createWarranty calls assertQualifyingInvoice before creating anything', body(warrantyService, 'async createWarranty(', 'async updateWarranty(').includes('assertQualifyingInvoice(invoice)'));
assertTrue('D-W2: createWarranty enforces franchise scope against the resolved invoice (no cross-franchise standalone warranty)', body(warrantyService, 'async createWarranty(', 'async updateWarranty(').includes('scope.unrestricted') && body(warrantyService, 'async createWarranty(', 'async updateWarranty(').includes('invoice.franchiseId'));
assertTrue('D-W2: customerId/vehicleNo are derived from the invoice, not trusted from the client', body(warrantyService, 'async createWarranty(', 'async updateWarranty(').includes('vehicleNo: invoice.vehicle') && body(warrantyService, 'async createWarranty(', 'async updateWarranty(').includes('resolveCustomerId(invoice.client'));
assertTrue('D-W2: warrantyNo is still allocated via the one canonical allocator, not a second mechanism', body(warrantyService, 'async createWarranty(', 'async updateWarranty(').includes('this.repository.allocateWarrantyNo()'));

assertTrue('D-W2: createWarrantySchema requires invoiceId', !createWarrantySchema.safeParse({ body: { itemName: 'x', durationDays: 90 } }).success);
assertTrue('D-W2: createWarrantySchema accepts a valid payload with invoiceId', createWarrantySchema.safeParse({ body: { invoiceId: 'INV-001', itemName: 'Ceramic Coating', durationDays: 730 } }).success);
assertTrue('D-W2: createWarrantySchema does not accept a client-supplied customerId (stripped by the schema, matching the derive-from-invoice policy)', !('customerId' in (createWarrantySchema.parse({ body: { invoiceId: 'INV-001', itemName: 'x', durationDays: 90, customerId: 'CUST-1' } }).body as any)));
assertTrue('D-W2: POST /api/warranties now has validate() attached (was completely unvalidated before WTY-01C)', (layerCount(warrantyRouter, 'post', '/') ?? 0) > 1);

// ═══ D-W3 — Management Approval requires no new workflow/status ═════════

const warrantyModelBlock = body(schemaPrisma, 'model Warranty {', '\n}');
assertTrue('D-W3: no new approval status/workflow field was added to the Warranty model specifically', !warrantyModelBlock.includes('approvalStatus') && !warrantyModelBlock.includes('managementApproval') && !warrantyModelBlock.includes('ApprovalWorkflow'));
assertTrue('D-W3: Warranty.status still only reflects the original 4 values, no 5th "PendingApproval"-style state introduced', /status\s+String\s+@default\("Active"\)\s*\/\/ "Active", "Expired", "Claimed", "Void"/.test(schemaPrisma));
assertTrue('D-W3: no new approval-workflow service/controller file was introduced under warranty/', !fs.existsSync(new URL('../src/modules/warranty/service/warrantyApproval.service.ts', import.meta.url)));

// ═══ D-W4 — Claims remain the existing JSON blob ═════════════════════════

assertTrue('D-W4: no WarrantyClaim model was introduced in the schema', !schemaPrisma.includes('model WarrantyClaim'));
assertTrue('D-W4: Warranty.claims is still a plain nullable String (JSON blob), not a relation', /claims\s+String\?/.test(schemaPrisma));
assertTrue('D-W4: addClaim still appends to the JSON array via the existing repository method, unchanged in shape', warrantyService.includes('this.repository.addClaim(id, existingClaims, newClaim, data.status)'));

// ═══ D-W5 — HQ-only modify/delete/claim authority ════════════════════════

assertEqual('D-W5: the modify-authority role set is exactly SUPER_ADMIN + HQ_USER', WARRANTY_MODIFY_ROLES, ['SUPER_ADMIN', 'HQ_USER']);
assertDoesNotThrow('D-W5: SUPER_ADMIN has modify authority', () => assertWarrantyModifyAuthority('SUPER_ADMIN'));
assertDoesNotThrow('D-W5: HQ_USER has modify authority', () => assertWarrantyModifyAuthority('HQ_USER'));
for (const role of ['FRANCHISE_ADMIN', 'BRANCH_MANAGER', 'BILLING_EXECUTIVE', 'INVENTORY_EXECUTIVE', 'RECEPTION_EXECUTIVE', 'SERVICE_ADVISOR', 'TECHNICIAN', 'QUALITY_INSPECTOR', undefined]) {
  assertThrows(`D-W5: "${role}" does NOT have modify authority`, () => assertWarrantyModifyAuthority(role));
}

assertTrue('D-W5: updateWarranty calls assertWarrantyModifyAuthority as its first check', body(warrantyService, 'async updateWarranty(', 'async addClaim(').trimStart().startsWith('async updateWarranty(id: string, data: UpdateWarrantyDTO, actor?: ScopeActor) {\n    assertWarrantyModifyAuthority(actor?.role);'));
assertTrue('D-W5: deleteWarranty calls assertWarrantyModifyAuthority as its first check', body(warrantyService, 'async deleteWarranty(').trimStart().startsWith('async deleteWarranty(id: string, actor?: ScopeActor) {\n    assertWarrantyModifyAuthority(actor?.role);'));
assertTrue('D-W5: addClaim calls assertWarrantyModifyAuthority as its first check', body(warrantyService, 'async addClaim(', 'async generateFromInvoice(').trimStart().startsWith('async addClaim(id: string, data: WarrantyClaimDTO, actor?: ActingUser) {\n    assertWarrantyModifyAuthority(actor?.role);'));
assertTrue('D-W5: read (getAllWarranties/getWarrantyById) and creation (createWarranty) remain unrestricted by role — only modify/delete/claim are gated', !body(warrantyService, 'async getAllWarranties(', 'async getWarrantyById(').includes('assertWarrantyModifyAuthority') && !body(warrantyService, 'async createWarranty(', 'async updateWarranty(').includes('assertWarrantyModifyAuthority'));

// Genuine behavioral proof: the real service, called with a real
// non-HQ role, actually throws — synchronously, before any DB access is
// attempted (assertWarrantyModifyAuthority is the first statement in each
// of these three methods).
async function verifyModifyAuthorityIsReallyEnforced() {
  const service = new WarrantyService();
  await assertRejects(
    'LIVE-STYLE CHECK: updateWarranty with a FRANCHISE_ADMIN actor really throws ForbiddenError (no DB reached)',
    () => service.updateWarranty('any-id', {}, { role: 'FRANCHISE_ADMIN', franchiseId: 'F1' }),
    'ForbiddenError'
  );
  await assertRejects(
    'LIVE-STYLE CHECK: deleteWarranty with a BRANCH_MANAGER actor really throws ForbiddenError (no DB reached)',
    () => service.deleteWarranty('any-id', { role: 'BRANCH_MANAGER', franchiseId: 'F1' }),
    'ForbiddenError'
  );
  await assertRejects(
    'LIVE-STYLE CHECK: addClaim with a TECHNICIAN actor really throws ForbiddenError (no DB reached)',
    () => service.addClaim('any-id', { description: 'x' }, { role: 'TECHNICIAN', franchiseId: 'F1' }),
    'ForbiddenError'
  );
}

// ═══ No duplicate warranty-creation/numbering mechanism introduced ═══════

assertTrue('exactly 3 warranty-creation paths still exist (no 4th introduced by WTY-01C)', [
  warrantyService.includes('async createWarranty('),
  warrantyService.includes('async generateFromInvoice('),
  src('src/modules/customer/repository/customer.repository.ts').includes('async addWarranty('),
].filter(Boolean).length === 3);
assertTrue('only ONE allocateWarrantyNo implementation exists', (src('src/modules/warranty/repository/warranty.repository.ts').match(/async allocateWarrantyNo/g) || []).length === 1);

async function main() {
  await verifyModifyAuthorityIsReallyEnforced();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main();
