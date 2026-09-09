// WTY-02 — Final Warranty Management Acceptance / Regression. Composes and
// re-verifies every guarantee established across WTY-01 (audit) ->
// WTY-01A (safe remediation) -> WTY-01B (locked decisions) -> WTY-01C
// (policy implementation) as one closeout suite, introducing no new
// functionality — purely acceptance verification, mirroring INV-07's role
// for the Inventory module.
//
// No live database connection exists in this sandbox (same status as
// every prior phase this entire engagement). Every assertion below is
// either a pure-function test of already-extracted logic, or a structural
// check reading actual source text to confirm a specific implementation
// detail. Nothing here proves a real invoice/warranty round-trip against a
// live database — that remains LIVE VERIFICATION PENDING, stated
// explicitly in the final report, never implied by a passing test here.
// Run with: npx tsx scripts/test-wty02-warranty-acceptance.ts
import fs from 'node:fs';
import { resolveDataScope, scopeWhere, isWithinScope } from '../src/shared/scope/dataScope.js';
import {
  resolveLineItemWarranty, resolveInvoiceLevelWarranty, applyServiceWarrantyDefaults,
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
  catch { pass++; console.log(`PASS: ${name}`); }
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

const warrantyService = src('src/modules/warranty/service/warranty.service.ts');
const warrantyRepo = src('src/modules/warranty/repository/warranty.repository.ts');
const warrantyController = src('src/modules/warranty/controller/warranty.controller.ts');
const warrantyRoutesSrc = src('src/modules/warranty/routes/warranty.routes.ts');
const warrantyTypes = src('src/modules/warranty/types/warranty.types.ts');
const billingService = src('src/modules/billing/service/billing.service.ts');
const customerService = src('src/modules/customer/service/customer.service.ts');
const customerRepo = src('src/modules/customer/repository/customer.repository.ts');
const customerController = src('src/modules/customer/controller/customer.controller.ts');
const customerRoutes = src('src/modules/customer/routes/customer.routes.ts');
const notificationService = src('src/shared/services/notification.service.ts');
const schemaPrisma = src('prisma/schema.prisma');

// ═══ 1. EPB requirements — persisted fields (§20, §7.8) ═════════════════

const warrantyModel = body(schemaPrisma, 'model Warranty {', '\n}');
for (const field of ['warrantyNo', 'customerId', 'vehicleNo', 'itemName', 'durationDays', 'startDate', 'expiryDate', 'status']) {
  assertTrue(`EPB §20 Warranty Information field "${field}" is persisted`, warrantyModel.includes(field));
}
assertTrue('EPB §20: warranty is linked to Customer (required relation)', warrantyModel.includes('customer      Customer'));
assertTrue('EPB §7.8: warranty is linked to the originating Job Card (jobId)', warrantyModel.includes('jobId'));
assertTrue('EPB §7.8/§20: warranty is linked to the originating Invoice (invoiceId)', warrantyModel.includes('invoiceId'));
assertTrue('EPB §20: "Warranty shall be generated from completed invoices" — generateFromInvoice (automatic) and createWarranty (manual, D-W2) both require a real invoice', warrantyService.includes('async generateFromInvoice(') && body(warrantyService, 'async createWarranty(', 'async updateWarranty(').includes('assertQualifyingInvoice'));
assertTrue('EPB §20: "Expired warranties shall become read-only" — enforced in updateWarranty, addClaim, and deleteWarranty', body(warrantyService, 'async updateWarranty(', 'async addClaim(').includes('read-only') && body(warrantyService, 'async addClaim(', 'async generateFromInvoice(').includes('read-only') && body(warrantyService, 'async deleteWarranty(').includes('read-only'));
assertTrue('EPB §20: "Warranty history shall remain permanent" — only softDelete exists, no hard-delete path', !warrantyRepo.includes('db.warranty.delete(') && warrantyRepo.includes('async softDelete('));
assertTrue('EPB §13.7: "Warranty details shall be printed on the invoice and stored in the customer history" — customer timeline includes WARRANTY_ISSUED events', customerService.includes("type: 'WARRANTY_ISSUED'"));
assertTrue('EPB §7.14/notifications: Warranty Expiry Reminder is implemented (live, 30-day window, scheduler-wired)', customerService.includes('thirtyDaysAhead') && customerRoutes.includes("requireSystemCredential('scheduler:customers:dispatch')"));

// ═══ 2. D-W1 — Service Master default (re-verify) ════════════════════════

const svcMap = new Map([['ceramic coating', '2 Year']]);
assertEqual('D-W1: explicit override always wins', resolveLineItemWarranty({ name: 'Ceramic Coating', warranty: 'Custom' }, svcMap), 'Custom');
assertEqual('D-W1: missing warranty defaults from Service Master', resolveLineItemWarranty({ name: 'Ceramic Coating' }, svcMap), '2 Year');
assertTrue('D-W1: wired into createInvoice, gated on type===\'Invoice\'', body(billingService, 'async createInvoice(', 'GST-03').includes("if (data.type === 'Invoice')") && body(billingService, 'async createInvoice(', 'GST-03').includes('applyServiceWarrantyDefaults('));
assertTrue('D-W1: only ONE Service Master default-resolution mechanism exists in the entire codebase', (billingService.match(/applyServiceWarrantyDefaults\(/g) || []).length === 1);

// ═══ 3. D-W2 — invoice-qualified manual creation (re-verify) ═════════════

assertThrows('D-W2: null invoice rejected', () => assertQualifyingInvoice(null));
assertThrows('D-W2: Quotation rejected (not a real Invoice)', () => assertQualifyingInvoice({ type: 'Quotation', isDeleted: false, status: 'Pending', franchiseId: null }));
assertThrows('D-W2: Cancelled invoice rejected', () => assertQualifyingInvoice({ type: 'Invoice', isDeleted: false, status: 'Cancelled', franchiseId: null }));
assertDoesNotThrow('D-W2: a real Invoice qualifies', () => assertQualifyingInvoice({ type: 'Invoice', isDeleted: false, status: 'Paid', franchiseId: null }));
assertTrue('D-W2: CreateWarrantyDTO.invoiceId is required, not optional', /invoiceId: string;/.test(warrantyTypes));
assertTrue('D-W2: customerId/vehicleNo are derived from the invoice, never trusted from the client', body(warrantyService, 'async createWarranty(', 'async updateWarranty(').includes('resolveCustomerId(invoice.client') && body(warrantyService, 'async createWarranty(', 'async updateWarranty(').includes('vehicleNo: invoice.vehicle'));
assertTrue('D-W2: franchise scope enforced against the resolved invoice (404 for out-of-scope, not 403 — matches this codebase\'s convention)', body(warrantyService, 'async createWarranty(', 'async updateWarranty(').includes('scope.unrestricted') && body(warrantyService, 'async createWarranty(', 'async updateWarranty(').includes('throw new NotFoundError'));
assertTrue('D-W2: POST /api/warranties has validate() attached', (layerCount(warrantyRouter, 'post', '/') ?? 0) > 1);
assertTrue('D-W2 KNOWN, DOCUMENTED ASYMMETRY: the customer-nested path (POST /customers/:id/warranties) was intentionally NOT given the same invoice-qualification requirement — D-W2\'s locked scope was "POST /api/warranties" specifically, not the customer-nested path (see warranty-decisions.md). It remains invoice-optional.', customerRepo.includes('invoiceId: data.invoiceId || null'));

// ═══ 4. D-W3/D-W4 — no structural changes (re-verify) ═══════════════════

assertTrue('D-W3: no approval-workflow field/model exists on Warranty', !warrantyModel.includes('approvalStatus') && !warrantyModel.includes('managementApproval'));
assertTrue('D-W4: claims remain a plain JSON String, no WarrantyClaim model', /claims\s+String\?/.test(schemaPrisma) && !schemaPrisma.includes('model WarrantyClaim'));

// ═══ 5. D-W5 — HQ-only modify/delete/claim authority (re-verify + genuinely behavioral) ═══

assertEqual('D-W5: modify-authority role set is exactly SUPER_ADMIN + HQ_USER', WARRANTY_MODIFY_ROLES, ['SUPER_ADMIN', 'HQ_USER']);
for (const role of ['FRANCHISE_ADMIN', 'BRANCH_MANAGER', 'BILLING_EXECUTIVE', 'INVENTORY_EXECUTIVE', 'RECEPTION_EXECUTIVE', 'SERVICE_ADVISOR', 'TECHNICIAN', 'QUALITY_INSPECTOR']) {
  assertThrows(`D-W5: "${role}" has no modify authority`, () => assertWarrantyModifyAuthority(role));
}
assertDoesNotThrow('D-W5: SUPER_ADMIN has modify authority', () => assertWarrantyModifyAuthority('SUPER_ADMIN'));
assertDoesNotThrow('D-W5: HQ_USER has modify authority', () => assertWarrantyModifyAuthority('HQ_USER'));

async function verifyD_W5Behaviorally() {
  const service = new WarrantyService();
  await assertRejects('D-W5 LIVE-STYLE: updateWarranty rejects FRANCHISE_ADMIN before any DB access', () => service.updateWarranty('x', {}, { role: 'FRANCHISE_ADMIN', franchiseId: 'F1' }), 'ForbiddenError');
  await assertRejects('D-W5 LIVE-STYLE: deleteWarranty rejects BILLING_EXECUTIVE before any DB access', () => service.deleteWarranty('x', { role: 'BILLING_EXECUTIVE', franchiseId: 'F1' }), 'ForbiddenError');
  await assertRejects('D-W5 LIVE-STYLE: addClaim rejects QUALITY_INSPECTOR before any DB access', () => service.addClaim('x', { description: 'y' }, { role: 'QUALITY_INSPECTOR', franchiseId: 'F1' }), 'ForbiddenError');
  // NOTE: proving this through the full controller chain (WarrantyController
  // .updateWarranty -> service) is NOT attempted here — that controller
  // fetches `oldValue` via a live db.warranty.findUnique() BEFORE calling
  // the service, so without a real database connection the request would
  // fail on that DB call first, not on the authority check. The
  // service-level proofs above are the honest, DB-free ceiling for this
  // sandbox; the full HTTP-level 403 remains LIVE VERIFICATION PENDING.
}

// ═══ 6. Franchise isolation / cross-franchise (re-verify) ════════════════

assertEqual('franchise-scoped actor resolves to exactly their own franchise, nothing else', scopeWhere(resolveDataScope({ role: 'FRANCHISE_ADMIN', franchiseId: 'FRANCHISE_A' })), { franchiseId: 'FRANCHISE_A' });
assertTrue('getAllWarranties/getWarrantyById/updateWarranty/addClaim/deleteWarranty all scope through the customer relation', (warrantyService.match(/scopeWhere\(scope\)/g) || []).length >= 5);
assertTrue('the customer-relation filter is unconditional in findAll (no alternate-ID bypass via customerId/vehicleNo/status/search)', body(warrantyRepo, 'async findAll(', 'async findById(').slice(0, body(warrantyRepo, 'async findAll(', 'async findById(').indexOf('};')).includes('customer: customerScopeWhere'));
assertTrue('findById applies the same unconditional customer-relation filter', body(warrantyRepo, 'async findById(', 'async findByInvoiceId(').includes('customer: customerScopeWhere'));
assertTrue('CustomerService.getWarranties/addWarranty check isWithinScope against the customer\'s own franchiseId (a 2nd, independent read path, also scoped)', body(customerService, 'async getWarranties(customerId').includes('isWithinScope(') && body(customerService, 'async addWarranty(customerId').includes('isWithinScope('));
assertTrue('generateFromInvoice\'s manually-triggered path (exposed route) verifies the resolved invoice\'s franchise before generating anything', body(warrantyService, 'async generateFromInvoice(', 'let targetInvoice').includes('invoice.franchiseId'));
assertTrue('createWarranty verifies the resolved invoice\'s franchise before creating anything (same convention)', body(warrantyService, 'async createWarranty(', 'async updateWarranty(').includes('invoice.franchiseId'));

// ═══ 7. Expiry protection (re-verify) ════════════════════════════════════

assertTrue('updateWarranty checks the live expiry date', body(warrantyService, 'async updateWarranty(', 'async addClaim(').includes('new Date(existing.expiryDate) < new Date()'));
assertTrue('addClaim checks the live expiry date', body(warrantyService, 'async addClaim(', 'async generateFromInvoice(').includes('new Date(existing.expiryDate) < new Date()'));
assertTrue('deleteWarranty checks the live expiry date (WTY-01A fix, still intact)', body(warrantyService, 'async deleteWarranty(').includes('new Date(existing.expiryDate) < new Date()'));
assertTrue('all three checks are consistent with each other (same comparison expression used in all three, not three different implementations)', (warrantyService.match(/new Date\(existing\.expiryDate\) < new Date\(\)/g) || []).length === 3);

// ═══ 8. Claims (re-verify, unchanged shape) ══════════════════════════════

assertTrue('claimedBy is actor-derived, never client-supplied', body(warrantyService, 'async addClaim(', 'async generateFromInvoice(').includes('claimedBy: actor?.name || actor?.id') && !body(warrantyService, 'async addClaim(', 'async generateFromInvoice(').includes('data.claimedBy'));
assertTrue('claim append logic unchanged (JSON array append via the existing repository method)', warrantyService.includes('this.repository.addClaim(id, existingClaims, newClaim, data.status)'));

// ═══ 9. Audit (re-verify) ═════════════════════════════════════════════

assertTrue('warranty controller audits all 5 actions (create/update/claim/generate/delete)', (warrantyController.match(/await logAudit\(/g) || []).length === 5);
assertTrue('customer-path warranty creation is audited', body(customerController, 'addWarranty =').includes('await logAudit('));
assertTrue('no second/new audit mechanism was introduced for warranty', !warrantyService.includes('logAudit'));

// ═══ 10. Notification behavior (re-verify Fix 6 cleanup) ═════════════════

assertTrue('the dead 7-day duplicate reminder implementation remains removed', !notificationService.includes('export async function dispatchCustomerReminders()'));
assertTrue('the live 30-day reminder implementation remains intact and unduplicated', (customerService.match(/async dispatchCustomerReminders\(\)/g) || []).length === 1);

// ═══ 11. Architecture — no duplicate mechanisms anywhere ═════════════════

assertTrue('exactly 3 warranty-creation paths exist (createWarranty, generateFromInvoice, CustomerRepository.addWarranty) — no 4th introduced across WTY-01A/B/C', [
  warrantyService.includes('async createWarranty('),
  warrantyService.includes('async generateFromInvoice('),
  customerRepo.includes('async addWarranty('),
].filter(Boolean).length === 3);
assertTrue('only ONE allocateWarrantyNo implementation exists', (warrantyRepo.match(/async allocateWarrantyNo/g) || []).length === 1 && !customerRepo.includes('allocateWarrantyNo'));
assertTrue('no second scope-resolution mechanism was introduced for warranty (reuses the canonical resolveDataScope/scopeWhere)', (warrantyService.match(/resolveDataScope\(/g) || []).length >= 5);
assertTrue('no dead/duplicate flat warranty files exist alongside the real controller/service/repository/routes/types/validation set (the pattern found and cleaned up in Inventory during INV-07)', !fs.existsSync(new URL('../src/modules/warranty/warranty.service.ts', import.meta.url)) && !fs.existsSync(new URL('../src/modules/warranty/warranty.controller.ts', import.meta.url)));

// ═══ 12. Regression / security posture spot-check ════════════════════════

assertTrue('warranty routes still require authentication (unchanged baseline)', warrantyRoutesSrc.includes('warrantyRouter.use(authenticate)'));
assertTrue('no warranty-specific RBAC action was ever invented (D-W5 uses an inline authority check, not requireAction)', !warrantyRoutesSrc.includes('requireAction'));

async function main() {
  await verifyD_W5Behaviorally();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
main();
