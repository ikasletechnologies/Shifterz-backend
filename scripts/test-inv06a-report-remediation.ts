// INV-06A — executable verification for the two fixes made:
// (1) the fabricated 35% retail-price/valuation figures are gone from the
//     Product Register and Inventory Valuation reports (both JSON and CSV
//     column sets), with no new price/markup source invented in their place;
// (2) the Stock Ledger report and its CSV export now accept optional
//     from/to bounding, applied alongside (not instead of) the INV-05
//     franchise-scope OR condition.
// These are structural/source-inspection checks, not live DB behavioral
// tests — there is no live database connection in this sandbox, same as
// every other DB-touching piece of this engagement. What IS genuinely
// verifiable without a DB: that the fabricated fields are actually gone
// from the source (not just from a comment claiming so), and that the
// date-range parameters actually flow from route -> controller -> service
// -> repository, all the way to the Prisma where-clause.
// Run with: npx tsx scripts/test-inv06a-report-remediation.ts
import fs from 'node:fs';

let pass = 0;
let fail = 0;

function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}

const serviceSource = fs.readFileSync(new URL('../src/modules/report/service/report.service.ts', import.meta.url), 'utf-8');
const repoSource = fs.readFileSync(new URL('../src/modules/report/repository/report.repository.ts', import.meta.url), 'utf-8');
const controllerSource = fs.readFileSync(new URL('../src/modules/report/controller/report.controller.ts', import.meta.url), 'utf-8');

// Strips `//`-comment lines before the "must not contain X" checks below, so
// this test's OWN explanatory comments (which necessarily name the removed
// literals/fields to explain why they're gone) don't produce false failures.
// Assertions that check something IS present don't need this — only ones
// checking something is absent from actual code.
const serviceCodeOnly = serviceSource.split('\n').filter(line => !line.trim().startsWith('//')).join('\n');

// ─── fabricated retail-price removal ─────────────────────────────────────

assertTrue('the 35% markup formula (cost * 1.35) is gone from actual code', !serviceCodeOnly.includes('1.35'));
assertTrue('no "totalRetailValue" field remains in actual code', !serviceCodeOnly.includes('totalRetailValue'));
assertTrue('no "Selling Price" CSV column label remains', !serviceSource.includes('Selling Price'));
assertTrue('no "Total Retail Value" CSV column label remains', !serviceSource.includes('Total Retail Value'));
assertTrue('no new sellingPrice/markup field was invented as a replacement, in actual code', !/sellingPrice|markup\s*[:=]/i.test(serviceCodeOnly));

const registerBody = serviceSource.slice(serviceSource.indexOf('async getProductRegisterReport'), serviceSource.indexOf('async getStockSummaryReport'));
assertTrue('getProductRegisterReport still returns the genuine cost field', registerBody.includes('cost: i.cost'));
assertTrue('getProductRegisterReport no longer returns a price field', !/\bprice:/.test(registerBody));

const valuationBody = serviceSource.slice(serviceSource.indexOf('async getInventoryValuationReport'), serviceSource.indexOf('async getStockLedgerReport'));
assertTrue('getInventoryValuationReport still returns the genuine cost-based totalCostValue', valuationBody.includes('totalCostValue: i.stock * i.cost'));
assertTrue('getInventoryValuationReport no longer returns a price field', !/\bprice:/.test(valuationBody));

// "register: [" appears once per report domain (billing/workshop/reception/
// financial each have their own) — anchor the search to start from
// exportInventoryCsv specifically, not the file's first "register: [" match.
const exportInventoryCsvIdx = serviceSource.indexOf('async exportInventoryCsv');
const registerColsBody = serviceSource.slice(serviceSource.indexOf('register: [', exportInventoryCsvIdx), serviceSource.indexOf('summary: [', exportInventoryCsvIdx));
assertTrue('register CSV column set has exactly 6 columns (price column removed, not just relabeled)', (registerColsBody.match(/key:/g) || []).length === 6);
const valuationColsBody = serviceSource.slice(serviceSource.indexOf('valuation: [', exportInventoryCsvIdx), serviceSource.indexOf('ledger: [', exportInventoryCsvIdx));
assertTrue('valuation CSV column set has exactly 5 columns (price + retail value columns removed)', (valuationColsBody.match(/key:/g) || []).length === 5);

// ─── Stock Ledger date-range bounding ────────────────────────────────────

assertTrue('getStockLedgerReport accepts from/to parameters', /async getStockLedgerReport\(franchiseId\?: string, from\?: string, to\?: string\)/.test(serviceSource));
assertTrue('getStockLedgerReport passes parsed dates through to the repository', serviceSource.includes('this.repository.getInventoryMovements(franchiseId, parseDate(from), parseDate(to))'));
assertTrue('exportInventoryCsv accepts from/to parameters', /async exportInventoryCsv\(type: string, franchiseId\?: string, from\?: string, to\?: string\)/.test(serviceSource));
assertTrue('exportInventoryCsv\'s ledger case forwards from/to (same filters as the JSON report, not a second implementation)', serviceSource.includes("this.getStockLedgerReport(franchiseId, from, to)"));

// INV-06B extended this signature with an additional optional `types`
// parameter (reused by the Dispatch/Movement reports) — check for the
// from/to portion as a prefix rather than the full exact signature, so
// this assertion doesn't go stale every time the signature legitimately
// grows a new optional trailing parameter.
assertTrue('getInventoryMovements repository method accepts from/to Date parameters', /async getInventoryMovements\(franchiseId\?: string, from\?: Date, to\?: Date/.test(repoSource));
assertTrue('the date filter is applied via performedAt.gte/lte', repoSource.includes('dateWhere.performedAt.gte = from') && repoSource.includes('dateWhere.performedAt.lte = to'));
assertTrue('the date filter is combined with the franchise-scoped branch (not replacing the INV-05 OR condition)', (() => {
  const franchiseBranch = repoSource.slice(repoSource.indexOf('if (franchiseId) {', repoSource.indexOf('async getInventoryMovements')), repoSource.indexOf('return db.inventoryMovement.findMany({\n      where: dateWhere,'));
  return franchiseBranch.includes('...dateWhere') && franchiseBranch.includes('OR: [');
})());
// INV-06B added a `typeWhere` spread alongside `dateWhere` in this branch
// (reused by the Dispatch/Movement reports' type filter) — check that the
// date filter is still present in the unrestricted branch's where clause,
// not for the exact object literal text.
const unrestrictedBranch = repoSource.slice(repoSource.lastIndexOf('return db.inventoryMovement.findMany({'));
assertTrue('the unrestricted (no franchiseId) branch still applies the date filter', unrestrictedBranch.includes('...dateWhere') && unrestrictedBranch.includes('orderBy: { performedAt:'));

// ─── controller wiring: from/to actually reach the service ──────────────

const controllerLedgerBody = controllerSource.slice(controllerSource.indexOf('getStockLedgerReport = async'), controllerSource.indexOf('exportInventoryCsv = async'));
assertTrue('controller\'s getStockLedgerReport extracts from/to from the query string', controllerLedgerBody.includes('req.query') && controllerLedgerBody.includes('{ from, to }'));
assertTrue('controller\'s getStockLedgerReport forwards from/to to the service', controllerLedgerBody.includes('this.service.getStockLedgerReport(franchiseId, from, to)'));

const controllerExportBody = controllerSource.slice(controllerSource.indexOf('exportInventoryCsv = async'), controllerSource.length);
assertTrue('controller\'s exportInventoryCsv extracts from/to from the query string', controllerExportBody.includes("type = 'register', from, to"));
assertTrue('controller\'s exportInventoryCsv forwards from/to to the service', controllerExportBody.includes('this.service.exportInventoryCsv(type, franchiseId, from, to)'));
assertTrue('the export audit record captures from/to too', controllerExportBody.includes("{ type, franchiseId, from, to }"));

// ─── unrelated reports untouched (scope discipline) ──────────────────────

const summaryBody = serviceSource.slice(serviceSource.indexOf('async getStockSummaryReport'), serviceSource.indexOf('async getLowStockReport'));
assertTrue('getStockSummaryReport (cost-based totalValue) was not touched by the price removal', summaryBody.includes('entry.totalValue += i.stock * i.cost'));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
