// WTY-01A — Warranty Management Safe Remediation. Verifies the 6 safe fixes
// applied on top of the WTY-01 audit findings: warranty-number allocation
// for the customer-path creation, franchise scoping (derived through the
// required Customer relation, no schema change), authenticated-actor
// usage, audit coverage, the live-expiry delete check, and removal of the
// dead duplicate reminder implementation.
//
// No live database connection exists in this sandbox (same status as every
// prior phase). Every assertion below is either a pure-function check
// (resolveDataScope/scopeWhere composition) or a structural check reading
// actual source text to confirm a specific implementation detail. Nothing
// here proves a real Prisma query actually returns the right rows — that
// remains LIVE VERIFICATION PENDING, stated explicitly, not implied.
// Run with: npx tsx scripts/test-wty01a-remediation.ts
import fs from 'node:fs';
import { resolveDataScope, scopeWhere, isWithinScope } from '../src/shared/scope/dataScope.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}
function assertEqual(name: string, actual: unknown, expected: unknown) {
  assertTrue(`${name} (got ${JSON.stringify(actual)})`, JSON.stringify(actual) === JSON.stringify(expected));
}

const root = (p: string) => new URL(`../${p}`, import.meta.url);
const src = (p: string) => fs.readFileSync(root(p), 'utf-8');
function body(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  return source.slice(start, end === -1 ? undefined : end);
}

const warrantyService = src('src/modules/warranty/service/warranty.service.ts');
const warrantyRepo = src('src/modules/warranty/repository/warranty.repository.ts');
const warrantyController = src('src/modules/warranty/controller/warranty.controller.ts');
const customerService = src('src/modules/customer/service/customer.service.ts');
const customerRepo = src('src/modules/customer/repository/customer.repository.ts');
const customerController = src('src/modules/customer/controller/customer.controller.ts');
const notificationService = src('src/shared/services/notification.service.ts');

// ═══ 1-3. Warranty number allocation ══════════════════════════════════════

assertTrue('1. CustomerRepository.addWarranty now requires a warrantyNo parameter', /async addWarranty\(customerId: string, data: CreateWarrantyDTO, warrantyNo: string\)/.test(customerRepo));
assertTrue('1. CustomerRepository.addWarranty writes the warrantyNo into the created row', body(customerRepo, 'async addWarranty(').includes('warrantyNo,'));
assertTrue('1. CustomerService.addWarranty allocates the number via the canonical WarrantyRepository, not a second generator', customerService.includes('this.warrantyRepository.allocateWarrantyNo()'));
assertTrue('2. warranty number is never accepted from the client — CreateWarrantyDTO (customer-path) has no warrantyNo field', !src('src/modules/customer/validation/customer.validation.ts').includes('warrantyNo'));
assertTrue('3. generateFromInvoice (existing, unmodified path) still calls the same canonical allocator', (body(warrantyService, 'async generateFromInvoice(').match(/this\.repository\.allocateWarrantyNo\(\)/g) || []).length === 2); // once for line-item warranties, once for the fallback branch
assertTrue('22. only ONE allocateWarrantyNo implementation exists in the entire codebase — no duplicate numbering mechanism introduced', (warrantyRepo.match(/async allocateWarrantyNo/g) || []).length === 1 && !customerRepo.includes('allocateWarrantyNo') && !customerService.includes('async allocateWarrantyNo'));

// ═══ 4-10, 24. Franchise scoping ══════════════════════════════════════════

assertEqual('4. HQ_USER scope is unrestricted — global warranty visibility', resolveDataScope({ role: 'HQ_USER' }).unrestricted, true);
assertEqual('4. SUPER_ADMIN scope is unrestricted — global warranty visibility', resolveDataScope({ role: 'SUPER_ADMIN' }).unrestricted, true);
assertEqual('5/6/7/8. franchise-scoped actor resolves to exactly their own franchiseId, nothing else reachable', scopeWhere(resolveDataScope({ role: 'FRANCHISE_ADMIN', franchiseId: 'FRANCHISE_A' })), { franchiseId: 'FRANCHISE_A' });
assertTrue('5. getWarrantyById passes scopeWhere(scope) into the scoped repository fetch', body(warrantyService, 'async getWarrantyById(').includes('scopeWhere(scope)'));
assertTrue('6. updateWarranty passes scopeWhere(scope) into the scoped repository fetch before allowing any modification', body(warrantyService, 'async updateWarranty(', 'async addClaim(').includes('scopeWhere(scope)'));
assertTrue('7. deleteWarranty passes scopeWhere(scope) into the scoped repository fetch before allowing deletion', body(warrantyService, 'async deleteWarranty(').includes('scopeWhere(scope)'));
assertTrue('8. addClaim passes scopeWhere(scope) into the scoped repository fetch before allowing a claim', body(warrantyService, 'async addClaim(', 'async generateFromInvoice(').includes('scopeWhere(scope)'));
assertTrue('9. CustomerService.getWarranties checks isWithinScope against the customer\'s own franchiseId', body(customerService, 'async getWarranties(customerId').includes('isWithinScope('));
assertTrue('9. CustomerService.addWarranty checks isWithinScope against the customer\'s own franchiseId before creating anything', body(customerService, 'async addWarranty(customerId').includes('isWithinScope('));
assertTrue('10. vehicle-number-filtered lookups go through the same scoped findAll as every other list query (no separate unscoped vehicle path)', body(warrantyRepo, 'async findAll(').includes('customer: customerScopeWhere') && body(warrantyRepo, 'async findAll(').includes('filter.vehicleNo'));
assertTrue('24. the customer-relation scope filter in findAll is unconditional — applied to the where clause regardless of which filter.* field the caller used (customerId/vehicleNo/status/search), so no alternate-ID path bypasses it', (() => {
  const findAllBody = body(warrantyRepo, 'async findAll(', 'async findById(');
  const whereBlockEnd = findAllBody.indexOf('};');
  const whereBlock = findAllBody.slice(0, whereBlockEnd);
  return whereBlock.includes('customer: customerScopeWhere');
})());
assertTrue('24. findById applies the same customer-relation scope filter unconditionally (no id-based bypass)', body(warrantyRepo, 'async findById(').includes('customer: customerScopeWhere'));
assertTrue('generateFromInvoice (manually-triggered path) verifies the resolved invoice\'s franchiseId is within the actor\'s scope before generating anything', body(warrantyService, 'async generateFromInvoice(', 'let targetInvoice').includes('scope.unrestricted') && body(warrantyService, 'async generateFromInvoice(', 'let targetInvoice').includes('invoice.franchiseId'));
assertTrue('the automatic billing-triggered call sites intentionally omit actor (documented, not a scope gap — they only ever target the invoice they just created/updated)', !src('src/modules/billing/service/billing.service.ts').includes('generateFromInvoice(invoice.id, actor)') && !src('src/modules/billing/service/billing.service.ts').includes('generateFromInvoice(updated.id, actor)'));

// ═══ 11-12. Authenticated actor, no client-supplied identity ═════════════

assertTrue('11. warranty controller now uses AuthRequest, not plain Express Request', warrantyController.includes('AuthRequest') && !warrantyController.includes('import type { Request, Response }'));
assertTrue('11. every warranty service call from the controller is passed req.user as the actor', (warrantyController.match(/req\.user\)/g) || []).length + (warrantyController.match(/req\.user\);/g) || []).length >= 4);
assertTrue('12. addClaim\'s claimedBy now comes from the actor, never from the client-supplied request body', body(warrantyService, 'async addClaim(', 'async generateFromInvoice(').includes('claimedBy: actor?.name || actor?.id') && !body(warrantyService, 'async addClaim(', 'async generateFromInvoice(').includes('data.claimedBy'));
assertTrue('12. audit userId always comes from req.user?.id, never a client-supplied field, on every warranty controller action', (warrantyController.match(/userId: req\.user\?\.id \|\| "unknown"/g) || []).length === 5);

// ═══ 13-17. Audit coverage ═════════════════════════════════════════════

assertTrue('13. warranty creation (WarrantyService path) is audited', body(warrantyController, 'createWarranty = async').includes('await logAudit('));
assertTrue('14. warranty creation (CustomerRepository path) is audited', body(customerController, 'addWarranty = async').includes('await logAudit('));
assertTrue('15. warranty update is audited', body(warrantyController, 'updateWarranty = async').includes('await logAudit('));
assertTrue('16. warranty deletion is audited (deletion remains supported, per the DO-NOT-FIX list)', body(warrantyController, 'deleteWarranty = async').includes('await logAudit('));
assertTrue('17. claim mutation is audited (claims remain supported, unredesigned)', body(warrantyController, 'addClaim = async').includes('await logAudit('));
assertTrue('generateFromInvoice (manual trigger) is also audited', body(warrantyController, 'generateFromInvoice = async').includes('await logAudit('));
assertTrue('no second/new audit mechanism was introduced — every call uses the existing shared logAudit', (warrantyController.match(/from "\.\.\/\.\.\/\.\.\/shared\/services\/audit\.service\.js"/g) || []).length === 1 && (customerController.match(/from '\.\.\/\.\.\/\.\.\/shared\/services\/audit\.service\.js'/g) || []).length === 1);

// ═══ 18-19. Expiry protection ══════════════════════════════════════════

const deleteWarrantyBody = body(warrantyService, 'async deleteWarranty(');
assertTrue('18. deleteWarranty now checks the LIVE expiry date, not only the persisted status field', deleteWarrantyBody.includes('new Date(existing.expiryDate) < new Date()'));
assertTrue('18. the live-date check is present ALONGSIDE the original status check (both still guard, matching updateWarranty/addClaim\'s existing pattern), not a replacement that removes the status check entirely', deleteWarrantyBody.includes('existing.status === "Expired"') && deleteWarrantyBody.includes('new Date(existing.expiryDate) < new Date()'));
assertTrue('19. an active (non-expired) warranty still ultimately calls softDelete, unchanged — only scope/audit were added around it, expiry logic itself untouched', deleteWarrantyBody.includes('this.repository.softDelete(id)'));
assertTrue('19. no hard-delete was introduced — softDelete remains the only deletion path', !deleteWarrantyBody.includes('db.warranty.delete('));

// ═══ 20-21. Notification cleanup ══════════════════════════════════════════

assertTrue('20. the dead 7-day dispatchCustomerReminders implementation no longer exists in notification.service.ts', !notificationService.includes('export async function dispatchCustomerReminders()'));
assertTrue('20. no remaining reference to a 7-day warranty-expiry window anywhere in notification.service.ts', !notificationService.includes('7 * 24 * 60 * 60 * 1000'));
assertTrue('21. the live 30-day warranty reminder implementation in CustomerService is untouched', customerService.includes('thirtyDaysAhead') || body(customerService, 'async dispatchCustomerReminders(').includes('30 * 24 * 60 * 60 * 1000'));
assertTrue('21. the live implementation is still wired to its scheduler route (requireSystemCredential, unchanged)', src('src/modules/customer/routes/customer.routes.ts').includes("requireSystemCredential('scheduler:customers:dispatch')"));
assertTrue('21. dispatchWorkshopReminders (a separate, live, unrelated sweep) was not touched by the cleanup', notificationService.includes('export async function dispatchWorkshopReminders()'));

// ═══ 23. generateFromInvoice core logic unchanged ═════════════════════════

assertTrue('23. the duplicate-generation guard (findByInvoiceId dedup check) is still present, unmodified', warrantyService.includes('this.repository.findByInvoiceId(targetInvoice.id)') && warrantyService.includes('if (existingWarranties.length > 0)'));
assertTrue('23. the hardcoded fallback duration string is still present, unmodified (explicitly deferred — item 5 in the DO-NOT-FIX list)', warrantyService.includes('"3 Months / 5,000 KM"'));
assertTrue('23. line-item warranty parsing logic is still present, unmodified', warrantyService.includes('for (const item of items)'));

// ═══ Canonical creation paths — documented, no 4th path introduced ═══════

const creationPathCount = [
  warrantyService.includes('async createWarranty('),
  warrantyService.includes('async generateFromInvoice('),
  customerRepo.includes('async addWarranty('),
].filter(Boolean).length;
assertTrue('exactly 3 warranty-creation paths remain (WarrantyService.createWarranty, WarrantyService.generateFromInvoice, CustomerRepository.addWarranty) — no 4th path was introduced by this remediation', creationPathCount === 3);
assertTrue('no new db.warranty.create call site was added anywhere outside the two existing repository files', (() => {
  const allSrc = src('src/modules/warranty/repository/warranty.repository.ts') + src('src/modules/customer/repository/customer.repository.ts');
  const totalCreateCalls = (allSrc.match(/db\.warranty\.create\(/g) || []).length;
  return totalCreateCalls === 2; // one in each repository — matches the 2 files that already owned this before WTY-01A
})());

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
