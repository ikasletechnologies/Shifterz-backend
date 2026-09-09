// INV-06B — executable verification for the three new EPB-required
// inventory reports (Stock Request, Dispatch, Stock Movement) and their
// scope/export wiring. Structural/source-inspection checks are used
// throughout — there is no live database connection in this sandbox, same
// as every other DB-touching piece of this engagement, so actual computed
// report VALUES (aggregation totals, joined names, scoped result sets)
// cannot be behaviorally verified here. What IS genuinely verifiable
// without a DB: that every new report reuses the existing scope resolver,
// the existing getInventoryMovements() query (not a second ledger
// implementation), the existing date-parsing convention, the existing CSV
// export/audit mechanism, and that none of the new report code performs
// any write operation.
// Run with: npx tsx scripts/test-inv06b-inventory-reports.ts
import fs from 'node:fs';
import { reportRouter } from '../src/modules/report/routes/report.routes.js';

let pass = 0;
let fail = 0;

function assertTrue(name: string, condition: boolean) {
  if (condition) { pass++; console.log(`PASS: ${name}`); }
  else { fail++; console.log(`FAIL: ${name}`); }
}

const serviceSource = fs.readFileSync(new URL('../src/modules/report/service/report.service.ts', import.meta.url), 'utf-8');
const repoSource = fs.readFileSync(new URL('../src/modules/report/repository/report.repository.ts', import.meta.url), 'utf-8');
const controllerSource = fs.readFileSync(new URL('../src/modules/report/controller/report.controller.ts', import.meta.url), 'utf-8');
const routesSource = fs.readFileSync(new URL('../src/modules/report/routes/report.routes.ts', import.meta.url), 'utf-8');

function methodBody(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  return source.slice(start, end === -1 ? undefined : end);
}

// ─── EPB determination is implemented: all three new reports exist ──────

assertTrue('getStockRequestReport exists (EPB §16.10 explicitly requires a Stock Request Report)', serviceSource.includes('async getStockRequestReport('));
assertTrue('getDispatchReport exists (EPB §16.10 explicitly requires a Dispatch Report)', serviceSource.includes('async getDispatchReport('));
assertTrue('getStockMovementReport exists (EPB §16.10 names Stock Movement Report and Stock Ledger separately)', serviceSource.includes('async getStockMovementReport('));
assertTrue('the pre-existing Stock Ledger was NOT removed or replaced (Ledger + Movement coexist, not a duplicate-vs-decision)', serviceSource.includes('async getStockLedgerReport('));

// ─── Part D: no duplicate movement-fetching implementation ───────────────

const movementReportBody = methodBody(serviceSource, 'async getStockMovementReport(', 'async getStockRequestReport(');
assertTrue('Stock Movement Report reuses the existing getInventoryMovements() query, not a second ledger implementation', movementReportBody.includes('this.repository.getInventoryMovements('));
assertTrue('Stock Movement Report does not call any other movement-fetching method', (movementReportBody.match(/this\.repository\.get\w*[Mm]ovement/g) || []).length === 1);

const dispatchReportBody = methodBody(serviceSource, 'async getDispatchReport(', 'async exportInventoryCsv(');
assertTrue('Dispatch Report reuses the existing getInventoryMovements() query, filtered to DISPATCH', dispatchReportBody.includes("this.repository.getInventoryMovements(") && dispatchReportBody.includes("['DISPATCH']"));
assertTrue('Dispatch is identified from the persisted DISPATCH movement type, not inferred from request status', !dispatchReportBody.includes("request.status === 'Dispatched'") && !dispatchReportBody.includes('r.status ==='));

assertTrue('getInventoryMovements repository method accepts an optional types filter (reused by Dispatch/Movement, not duplicated)', /async getInventoryMovements\(franchiseId\?: string, from\?: Date, to\?: Date, types\?: string\[\]\)/.test(repoSource));

// ─── canonical scope resolver reused, not a parallel scope mechanism ────

assertTrue('controller\'s getStockRequestReport uses the canonical resolveScope(), not a new scope mechanism', controllerSource.includes('getStockRequestReport = async') && methodBody(controllerSource, 'getStockRequestReport = async', 'getDispatchReport = async').includes('this.resolveScope(req)'));
assertTrue('controller\'s getDispatchReport uses the canonical resolveScope()', methodBody(controllerSource, 'getDispatchReport = async', 'exportInventoryCsv = async').includes('this.resolveScope(req)'));
assertTrue('controller\'s getStockMovementReport uses the canonical resolveScope()', methodBody(controllerSource, 'getStockMovementReport = async', 'getStockRequestReport = async').includes('this.resolveScope(req)'));
assertTrue('no second scope-resolution method was introduced in the controller', (controllerSource.match(/private resolveScope/g) || []).length === 1);

// ─── date filtering wired through for the two date-bound new reports ────

assertTrue('getStockRequestReport accepts and forwards from/to using the existing parseDate() convention', serviceSource.includes('this.repository.getInventoryRequestsInRange(franchiseId, parseDate(from), parseDate(to))'));
assertTrue('getDispatchReport accepts and forwards from/to using the existing parseDate() convention', serviceSource.includes("this.repository.getInventoryMovements(franchiseId, parseDate(from), parseDate(to), ['DISPATCH'])"));
assertTrue('getInventoryRequestsInRange applies from via gte and to via lte, matching the existing repository convention', repoSource.includes('where.date.gte = from') && repoSource.includes('where.date.lte = to'));

// ─── data correctness: real persisted fields only, no invented columns ──

const requestReportBody = methodBody(serviceSource, 'async getStockRequestReport(', 'async getDispatchReport(');
assertTrue('Stock Request Report exposes quantityRequested and quantityApproved from the real InventoryRequest fields', requestReportBody.includes('quantityRequested: r.quantityRequested') && requestReportBody.includes('quantityApproved: r.quantityApproved'));
assertTrue('Stock Request Report exposes the real requestedBy field added in INV-05, not an invented one', requestReportBody.includes('requestedBy: r.requestedBy'));
assertTrue('Stock Request Report does NOT reference any approvedBy/approvedAt field (InventoryRequest has none — not invented)', !requestReportBody.includes('.approvedBy') && !requestReportBody.includes('.approvedAt'));
assertTrue('dispatch/receipt info comes from real DISPATCH/RECEIVE movement rows (reference-linked), not invented columns', requestReportBody.includes("m.type === 'DISPATCH'") && requestReportBody.includes("m.type === 'RECEIVE'"));

assertTrue('Dispatch Report exposes the movement\'s own franchiseId as the destination (INV-02\'s destination-franchise tagging), not a guess', dispatchReportBody.includes('destinationFranchise:') && dispatchReportBody.includes('m.franchiseId'));
assertTrue('Dispatch Report links back to its InventoryRequest via the real REQ-<id> reference convention', dispatchReportBody.includes("m.reference.startsWith('REQ-')"));

// ─── export: same service logic as JSON, permission and audit preserved ─

const exportBody = methodBody(serviceSource, 'async exportInventoryCsv(', 'ReportService');
assertTrue('CSV export for "movement" calls the exact same getStockMovementReport() used by the JSON route', exportBody.includes("this.getStockMovementReport(franchiseId, from, to)"));
assertTrue('CSV export for "stock-request" calls the exact same getStockRequestReport() used by the JSON route', exportBody.includes("this.getStockRequestReport(franchiseId, from, to)"));
assertTrue('CSV export for "dispatch" calls the exact same getDispatchReport() used by the JSON route', exportBody.includes("this.getDispatchReport(franchiseId, from, to)"));
assertTrue('all three new report types have CSV column sets defined', serviceSource.includes('movement: [') && serviceSource.includes("'stock-request': [") && serviceSource.includes('dispatch: ['));

function layerCount(router: any, method: string, path: string): number | null {
  const layer = router.stack.find((l: any) => l.route && l.route.path === path && l.route.methods[method]);
  return layer ? layer.route.stack.length : null;
}
assertTrue('GET /inventory/movement is gated with reports:inventory:view (same permission as every other inventory report)', (layerCount(reportRouter, 'get', '/inventory/movement') ?? 0) > 1);
assertTrue('GET /inventory/stock-requests is gated with reports:inventory:view', (layerCount(reportRouter, 'get', '/inventory/stock-requests') ?? 0) > 1);
assertTrue('GET /inventory/dispatches is gated with reports:inventory:view', (layerCount(reportRouter, 'get', '/inventory/dispatches') ?? 0) > 1);
assertTrue('no new RBAC action was introduced for these routes — same requireAction call as the existing five', routesSource.includes("requireAction('reports:inventory:view'), controller.getStockMovementReport") && !/requireAction\('reports:inventory:(movement|dispatch|request)/.test(routesSource));
assertTrue('the export route still uses reports:inventory:export unchanged', routesSource.includes("requireAction('reports:inventory:export'), controller.exportInventoryCsv"));
assertTrue('exportInventoryCsv\'s audit call is unchanged (still covers every type generically, including the three new ones)', controllerSource.includes("await this.auditExport(req, 'Inventory', { type, franchiseId, from, to })"));

// ─── regression: existing five inventory report routes remain intact ────

for (const path of ['/inventory/register', '/inventory/summary', '/inventory/low-stock', '/inventory/valuation', '/inventory/ledger', '/inventory/export']) {
  assertTrue(`existing route ${path} is still registered`, routesSource.includes(`'${path}'`));
}

// ─── data integrity: reports remain read-only, no mutation introduced ───

for (const [name, body] of [
  ['getStockMovementReport', movementReportBody],
  ['getStockRequestReport', requestReportBody],
  ['getDispatchReport', dispatchReportBody],
] as const) {
  assertTrue(`${name} performs no create/update/delete — reports remain read-only`, !/\.(create|update|delete|upsert)\(/.test(body));
}

// ─── Part I: soft-deleted items/requests excluded, no invented cancel semantics ──

assertTrue('getInventoryRequestsInRange excludes soft-deleted requests (isDeleted: false)', repoSource.includes("async getInventoryRequestsInRange") && methodBody(repoSource, 'async getInventoryRequestsInRange', 'async getFranchises').includes('isDeleted: false'));
assertTrue('no new InventoryRequest cancellation/deletion semantics were introduced in this phase', !serviceSource.includes("status: 'Cancelled'") && !repoSource.includes("inventoryRequest.update"));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
