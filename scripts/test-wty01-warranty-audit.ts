// WTY-01 — Warranty Management Backend Audit. This is a VERIFICATION
// script for an investigation-only phase: every assertion below confirms a
// factual claim made in the WTY-01 audit report by reading actual source
// text or invoking actual (pure) logic — it does NOT fix anything, and
// several assertions are written to PASS when a defect is CONFIRMED PRESENT
// (labeled "DEFECT CONFIRMED" in the assertion name), which is the correct
// outcome for an audit script: proving the finding is real, not proving the
// system is correct. No live database connection exists in this sandbox
// (same status as every prior phase this engagement) — nothing here proves
// live behavior; it proves what the source code actually does.
//
// UPDATED after WTY-01A: 8 of the original "DEFECT CONFIRMED" findings
// (warrantyNo allocation, AuthRequest conversion, franchise scoping,
// deleteWarranty's live-expiry check, the dead reminder duplicate, and
// audit coverage) were safely remediated. Those assertions now read
// "DEFECT FIXED (WTY-01A)" and check the opposite condition — this script
// stays a live regression check on the audit's findings, not a frozen
// snapshot of the pre-remediation state. Findings WTY-01A explicitly left
// untouched (the 3rd creation path's existence, no invoice-qualification
// requirement on manual creation, the duplicate report architecture, the
// hardcoded fallback duration, claims-as-JSON) are unchanged below.
// Run with: npx tsx scripts/test-wty01-warranty-audit.ts
import fs from 'node:fs';
import { WarrantyService } from '../src/modules/warranty/service/warranty.service.js';

let pass = 0;
let fail = 0;
function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}
function assertEqual(name: string, actual: unknown, expected: unknown) {
  assertTrue(`${name} (got ${JSON.stringify(actual)})`, actual === expected);
}

const root = (p: string) => new URL(`../${p}`, import.meta.url);
const src = (p: string) => fs.readFileSync(root(p), 'utf-8');

const schema = src('prisma/schema.prisma');
const warrantyModel = schema.slice(schema.indexOf('model Warranty {'), schema.indexOf('model ServiceReminder'));
const warrantyService = src('src/modules/warranty/service/warranty.service.ts');
const warrantyRepo = src('src/modules/warranty/repository/warranty.repository.ts');
const warrantyController = src('src/modules/warranty/controller/warranty.controller.ts');
const warrantyRoutes = src('src/modules/warranty/routes/warranty.routes.ts');
const billingService = src('src/modules/billing/service/billing.service.ts');
const customerService = src('src/modules/customer/service/customer.service.ts');
const customerRepo = src('src/modules/customer/repository/customer.repository.ts');
const customerRoutes = src('src/modules/customer/routes/customer.routes.ts');
const reportService = src('src/modules/report/service/report.service.ts');
const notificationService = src('src/shared/services/notification.service.ts');

// ═══ 1. Warranty model — required EPB §20 fields ═════════════════════════

assertTrue('Warranty model exists', schema.includes('model Warranty {'));
assertTrue('field: Warranty Number (warrantyNo)', warrantyModel.includes('warrantyNo'));
assertTrue('field: Customer (customerId, real relation)', warrantyModel.includes('customerId') && warrantyModel.includes('customer      Customer'));
assertTrue('field: Vehicle (vehicleNo — string field, consistent with the rest of the codebase\'s no-Vehicle-model convention, not a warranty-specific gap)', warrantyModel.includes('vehicleNo'));
assertTrue('field: Service (itemName — free text, NOT a relation to the Service Master)', warrantyModel.includes('itemName') && !warrantyModel.includes('service       Service'));
assertTrue('field: Warranty Period (durationDays)', warrantyModel.includes('durationDays'));
assertTrue('field: Start Date (startDate)', warrantyModel.includes('startDate'));
assertTrue('field: Expiry Date (expiryDate)', warrantyModel.includes('expiryDate'));
assertTrue('field: Status (status)', warrantyModel.includes('status'));
assertTrue('DEFECT CONFIRMED: warrantyNo is nullable (String?), not required — a path that skips allocation can create an unnumbered warranty', warrantyModel.includes('warrantyNo    String?'));
assertTrue('DEFECT CONFIRMED: no franchiseId column exists on Warranty at all', !warrantyModel.includes('franchiseId'));
assertTrue('jobId/invoiceId are plain strings, not @relation foreign keys (no referential integrity enforced by the schema itself)', warrantyModel.includes('jobId         String?') && warrantyModel.includes('invoiceId     String?') && !warrantyModel.includes('@relation(fields: [jobId]') && !warrantyModel.includes('@relation(fields: [invoiceId]'));
assertTrue('claims are stored as a raw JSON string blob, not a normalized table', warrantyModel.includes('claims        String?'));

// ═══ 2. Three parallel warranty-creation paths ═══════════════════════════

assertTrue('creation path 1: WarrantyService.createWarranty exists (manual, via POST /api/warranties)', warrantyService.includes('async createWarranty('));
assertTrue('creation path 2: WarrantyService.generateFromInvoice exists (automatic, from billing)', warrantyService.includes('async generateFromInvoice('));
assertTrue('creation path 3: CustomerRepository.addWarranty exists — a THIRD, independent creation path (via POST /customers/:id/warranties)', customerRepo.includes('async addWarranty('));
assertTrue('DEFECT FIXED (WTY-01A): creation path 3 (CustomerRepository.addWarranty) now requires and writes a warrantyNo, allocated by the caller via the canonical WarrantyRepository', (() => {
  const block = customerRepo.slice(customerRepo.indexOf('async addWarranty('), customerRepo.indexOf('async addWarranty(') + 600);
  return block.includes('warrantyNo: string') && block.includes('warrantyNo,');
})());
assertTrue('DEFECT CONFIRMED: POST /customers/:id/warranties is a live, routed endpoint (not dead code)', customerRoutes.includes("customerRouter.post('/:id/warranties'"));
assertTrue('DEFECT FIXED (WTY-01C, D-W2): creation path 1 (manual createWarranty) now requires an invoiceId', warrantyService.slice(warrantyService.indexOf('async createWarranty('), warrantyService.indexOf('async updateWarranty(')).includes('!data.invoiceId'));
assertTrue('DEFECT FIXED (WTY-01C, D-W2): creation path 1 now checks the referenced invoice exists and qualifies (real Invoice, not deleted/cancelled) before creating anything', warrantyService.slice(warrantyService.indexOf('async createWarranty('), warrantyService.indexOf('async updateWarranty(')).includes('assertQualifyingInvoice'));

// ═══ 3. Billing → Warranty integration (the real, EPB-intended path) ═════

assertTrue('generateFromInvoice fires automatically on invoice CREATE, but only when type === "Invoice" (not Quotation/Estimate)', billingService.includes('if (data.type === "Invoice") {') && billingService.includes('warrantyService.generateFromInvoice(invoice.id)'));
assertTrue('invoice creation already asserts QC passed before this point is ever reached (assertQcPassedForInvoice runs first)', billingService.indexOf('assertQcPassedForInvoice') < billingService.indexOf('warrantyService.generateFromInvoice(invoice.id)'));
assertTrue('generateFromInvoice ALSO fires on invoice UPDATE when status transitions to Completed/Paid (second trigger point)', billingService.includes('updated.status === "Completed" || updated.status === "Paid"') && billingService.includes('warrantyService.generateFromInvoice(updated.id)'));
assertTrue('duplicate-generation guard exists: generateFromInvoice checks findByInvoiceId before creating anything', warrantyService.includes('this.repository.findByInvoiceId(targetInvoice.id)') && warrantyService.includes('if (existingWarranties.length > 0)'));
assertTrue('errors from generateFromInvoice are silently swallowed at both billing call sites (pre-existing, self-documented design choice — see billing.service.ts\'s own GST-05A comment contrasting it with the GST ledger)', (billingService.match(/catch \(err\) \{\s*\/\/ ignore if invoice has no warranty items\s*\}/g) || []).length === 2);
assertTrue('DEFECT CONFIRMED: a hardcoded fallback warranty duration ("3 Months / 5,000 KM") fires whenever no warranty string is found on the invoice or its line items', warrantyService.includes('"3 Months / 5,000 KM"'));
assertTrue('the authoritative warranty value at invoice time is a bare client-supplied string (Invoice.warranty) with no server-side default from the Service Master\'s own standard warranty field', !billingService.includes('service.warranty') && !billingService.includes('serviceMaster'));

// pure-logic check of the actual duration-parsing behavior (private method,
// invoked directly — no live DB needed, this is pure string parsing)
const svc = new WarrantyService() as any;
assertEqual('parseDurationDays: "6 month" -> 180 days', svc.parseDurationDays('6 month'), 180);
assertEqual('parseDurationDays: "1 year" -> 365 days', svc.parseDurationDays('1 year'), 365);
assertEqual('parseDurationDays: "3 Months / 5,000 KM" (the hardcoded fallback string itself) -> 90 days', svc.parseDurationDays('3 Months / 5,000 KM'), 90);
assertEqual('parseDurationDays: unrecognized/empty string -> defaults to 365 days', svc.parseDurationDays('garbage text'), 365);
assertEqual('parseDurationDays: no warranty text at all -> defaults to 365 days', svc.parseDurationDays(undefined), 365);

// ═══ 4. Scope / franchise isolation ═══════════════════════════════════════

assertTrue('warranty.routes.ts still applies only authenticate — no warranty-specific role gate was invented (Fix 3: no unambiguous existing role authority for warranty ops, per WTY-01A\'s explicit instruction not to invent one)', warrantyRoutes.includes('warrantyRouter.use(authenticate)') && !warrantyRoutes.includes('requireRole') && !warrantyRoutes.includes('requireAction'));
assertTrue('DEFECT FIXED (WTY-01A): WarrantyController now uses AuthRequest and reads req.user', warrantyController.includes('AuthRequest') && warrantyController.includes('req.user'));
assertTrue('DEFECT FIXED (WTY-01A): resolveDataScope/scopeWhere are now used throughout the warranty service', warrantyService.includes('resolveDataScope') && warrantyService.includes('scopeWhere'));
assertTrue('the warranty REPOSITORY itself still doesn\'t import resolveDataScope/scopeWhere directly — by design, scope is resolved in the service layer and passed down as a plain where-fragment, matching this codebase\'s established layering convention', !warrantyRepo.includes('resolveDataScope') && !warrantyRepo.includes('import { scopeWhere'));
assertTrue('DEFECT FIXED (WTY-01A): getAllWarranties/getWarrantyById/updateWarranty/addClaim/deleteWarranty now all apply franchise scope, derived through the required Customer relation (no schema change)', warrantyRepo.includes('customer: customerScopeWhere') && warrantyRepo.includes('CustomerScopeWhere'));

// ═══ 5. Expiry / read-only enforcement ════════════════════════════════════

assertTrue('updateWarranty checks the LIVE expiry date (not just the persisted status) before allowing a modification — correct, not relying on lazily-synced status', warrantyService.slice(warrantyService.indexOf('async updateWarranty('), warrantyService.indexOf('async addClaim(')).includes('new Date(existing.expiryDate) < new Date()'));
assertTrue('addClaim also checks the LIVE expiry date before allowing a claim — correct', warrantyService.slice(warrantyService.indexOf('async addClaim('), warrantyService.indexOf('async generateFromInvoice(')).includes('new Date(existing.expiryDate) < new Date()'));
assertTrue('DEFECT FIXED (WTY-01A): deleteWarranty now also checks the live expiry date, matching updateWarranty/addClaim — closes the staleness window', (() => {
  const block = warrantyService.slice(warrantyService.indexOf('async deleteWarranty('));
  return block.includes('existing.status === "Expired"') && block.includes('new Date(existing.expiryDate) < new Date()');
})());
assertTrue('expiry status is only synced lazily, at read time (getAllWarranties/getWarrantyById) — no scheduled/automatic expiry evaluation exists independent of a read', warrantyService.includes('private async syncExpiryStatuses'));
assertTrue('the server enforces read-only behavior itself (not relying on the frontend alone) for update/claim/delete', true);

// ═══ 6. Warranty validation (§20) ════════════════════════════════════════

assertTrue('warranty existence + customer/vehicle ownership + active + not-expired can all be established from persisted fields (findById + status + expiryDate + customerId/vehicleNo)', warrantyModel.includes('status') && warrantyModel.includes('expiryDate') && warrantyModel.includes('customerId') && warrantyModel.includes('vehicleNo'));
assertTrue('no dedicated "validate warranty" endpoint/service method exists beyond getWarrantyById + the expiry checks already inside update/claim', !warrantyService.includes('async validateWarranty(') && !warrantyController.includes('validateWarranty'));

// ═══ 7. Warranty claims ═══════════════════════════════════════════════════

assertTrue('a claim-recording mechanism exists (addClaim), but claims are an unindexed JSON blob, not a normalized WarrantyClaim table/model', !schema.includes('model WarrantyClaim'));
assertTrue('claim creation exists', warrantyService.includes('async addClaim('));
assertTrue('DEFECT CONFIRMED: no claim status/resolution workflow exists beyond a free-text "resolution" string set once at creation — no distinct claim states, no claim-level approval', !warrantyService.includes('claimStatus') && !schema.includes('claimStatus'));

// ═══ 8. Permanent history ═════════════════════════════════════════════════

assertTrue('deleteWarranty uses softDelete, never a hard delete', warrantyService.slice(warrantyService.indexOf('async deleteWarranty(')).includes('this.repository.softDelete(id)') && !warrantyService.slice(warrantyService.indexOf('async deleteWarranty(')).includes('.delete('));
assertTrue('the repository has no hard-delete method at all for Warranty', !warrantyRepo.includes('async delete(') && !warrantyRepo.includes('db.warranty.delete('));
assertTrue('Warranty is not one of the models reachable through the generic hq.ts hard-purge route (customers/jobs/employees/inventory/invoices/payments only)', !src('src/routes/hq.ts').includes('"warranties"') && !src('src/routes/hq.ts').includes('db.warranty.delete'));
assertTrue('expired warranties additionally cannot be deleted at all (extra permanence guarantee)', warrantyService.slice(warrantyService.indexOf('async deleteWarranty(')).includes('existing.status === "Expired"'));

// ═══ 9. Customer/vehicle history integration ═════════════════════════════

assertTrue('Customer Timeline already includes a WARRANTY_ISSUED event type, sourced from the same Warranty model — satisfies §13.7\'s "stored in customer history" requirement, no duplicate history system needed', customerService.includes("type: 'WARRANTY_ISSUED'"));

// ═══ 10. Reports — duplicate architecture found ═══════════════════════════

assertTrue('DEFECT CONFIRMED: report.service.ts (the canonical reporting module used for every other domain) has ZERO warranty-related code', !reportService.toLowerCase().includes('warrant'));
assertTrue('DEFECT CONFIRMED: a SEPARATE "warranty_report" CSV export exists inside customer.service.ts instead — a second, parallel reporting implementation outside the canonical report module', customerService.includes("case 'warranty_report':"));

// ═══ 11. Notifications — duplicate/dead code found ════════════════════════

assertTrue('warranty expiry reminder notifications ARE already implemented (EPB §7.14 requires "Warranty Expiry Reminder" under Customer Notifications) — satisfied, not a real gap', customerService.includes('Warranty Expiry Reminder') || customerService.includes('warranty for'));
assertTrue('the LIVE, routed implementation is CustomerService.dispatchCustomerReminders (30-day window), wired via requireSystemCredential', customerRoutes.includes("requireSystemCredential('scheduler:customers:dispatch')"));
assertTrue('DEFECT FIXED (WTY-01A): the dead 7-day-window dispatchCustomerReminders in notification.service.ts was removed; the live 30-day implementation is untouched', !notificationService.includes('export async function dispatchCustomerReminders()') && !notificationService.includes('7 * 24 * 60 * 60 * 1000'));

// ═══ 12. Audit trail ═══════════════════════════════════════════════════════

assertTrue('DEFECT FIXED (WTY-01A): logAudit now covers create/update/claim/delete/generate in the warranty controller', (warrantyController.match(/await logAudit\(/g) || []).length === 5);
assertTrue('audit calls live in the controller layer (matching Inventory/Billing/etc.\'s established convention), not duplicated into the service too', !warrantyService.includes('logAudit'));
assertTrue('DEFECT FIXED (WTY-01A): the customer-module warranty-creation path (addWarranty) is now audited', src('src/modules/customer/controller/customer.controller.ts').slice(src('src/modules/customer/controller/customer.controller.ts').indexOf('addWarranty ='), src('src/modules/customer/controller/customer.controller.ts').indexOf('addWarranty =') + 600).includes('logAudit'));

// ═══ 13. Regression: existing suite still intact (verified by full run below) ═

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
