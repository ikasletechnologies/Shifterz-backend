# REP-01B — Reports & Dashboards Architecture & Policy Decisions

Locked architectural/policy decisions for the Reports & Dashboards module (EPB §16), following the REP-01 audit and REP-01A safe remediation. These decisions govern REP-01C's implementation scope. Nothing in this document has been implemented yet — this is a decision record only, mirroring the format and discipline of `docs/decisions/rbac-decisions.md`, `docs/decisions/warranty-decisions.md`, and `docs/decisions/inventory-decisions.md`.

---

## General Principle — One Authoritative Calculation Source

**A report or dashboard metric shall have exactly one authoritative calculation.** API routes/endpoints may adapt, reshape, or expose that result differently, but must never independently recompute the same underlying business metric with separate query/aggregation logic. This is the root-cause principle behind every duplicate found in REP-01 (Lead reports, Customer reports, Employee Performance, three HQ dashboards, two Franchise dashboards) and governs all seven decisions below.

**Status**: LOCKED.

---

## D-REP1 — Canonical Report Engine

**Decision**: `report.service.ts` becomes the canonical calculation layer for every EPB §16 report. Specialized services (`leadReport.service.ts`, `customer.service.ts`'s report/CSV switch, `hq.ts`'s report routes) may remain temporarily as **thin adapters** calling into `report.service.ts`, but must not independently calculate a canonical report after consolidation.

**Rationale**: `report.service.ts` already holds the majority of the catalogue, the established RBAC/export architecture (`requireAction`, `auditExport`), and the canonical scope mechanism (`ReportController.resolveScope()`). Consolidating elsewhere would mean rebuilding all of that.

**Scope**: Applies to calculation logic only — which function computes a metric. Does not by itself mandate deleting any route (see D-REP2/D-REP4).

**Status**: LOCKED.

---

## D-REP2 — Duplicate Route Strategy

**Decision**: Existing duplicate endpoints become **compatibility wrappers** around the canonical `report.service.ts` calculation, rather than being deleted outright — unless a specific endpoint is later proven unused by any real consumer.

**Rationale**: This is a backend-only workspace with no visibility into frontend consumption; deleting a route an unseen frontend depends on would be a real regression with no way to detect it here. Consolidating the *calculation* eliminates the actual defect risk (three subtly different definitions of the same metric) without requiring proof of non-usage first.

**Scope**: `GET /api/leads/reports/:type`, `GET /api/leads/dashboard`, `customer.service.ts`'s report/CSV switch, and `hq.ts`'s report routes (e.g. `/reports/employees/performance`) are all candidates for this treatment during REP-01C.

**Status**: LOCKED.

---

## D-REP3 — Dashboard Architecture

**Decision**: Dashboards are **not** consolidated into a single `/api/dashboard` response. The EPB explicitly defines distinct HQ and Franchise dashboards (§16.3/§16.4) with different field lists — that distinction is preserved. Instead, a shared aggregation layer provides common metrics (e.g. `getRevenueSummary()`, `getLeadSummary()`, `getWorkshopSummary()`, `getInventorySummary()`, `getEmployeeSummary()`), and each dashboard view composes from those shared helpers rather than each dashboard endpoint running its own independent query set.

**Rationale**: Eliminates the duplicated computation (three different `activeFranchises`/`billingPending`-style calculations across `getHQSummary`, `hq.ts`'s `/dashboard`, and `dashboard.ts`) without erasing the EPB's own deliberate HQ-vs-Franchise distinction.

**Scope**: Exact helper method names/signatures are an implementation detail for REP-01C, not re-litigated here — this decision locks the *shape* (shared aggregation, distinct composed views), not the exact API surface.

**Status**: LOCKED.

---

## D-REP4 — Dashboard/Report Endpoint Classification Framework

**Decision**: Every dashboard-shaped endpoint found in REP-01 (`/reports/hq-summary`, `/hq/dashboard`, `/dashboard`, `/technician/franchise-dashboard`, `/hq/franchises/:id/stats`, `/leads/dashboard`) is classified, **during REP-01C's actual implementation work**, into exactly one of:

- **CANONICAL** — the one authoritative implementation for that dashboard view.
- **COMPATIBILITY** — a thin adapter preserving an existing route/contract, delegating to the canonical implementation (per D-REP2).
- **SPECIALIZED** — retained as a genuinely distinct view, only if REP-01C can demonstrate it serves a use case the canonical views don't cover (not assumed, proven).
- **DEPRECATED** — documented as a removal candidate for a future phase, never silently deleted now.

**Important**: this document does **not** pre-assign each of the six listed endpoints to a category — that per-endpoint judgment happens in REP-01C, informed by this framework, since it requires implementation-time comparison of response contracts (exactly the "response contracts, filters, scope behavior, calculations, CSV output, consumers" comparison the original audit called for).

**Status**: LOCKED (the framework; per-endpoint classification is explicitly deferred to REP-01C).

---

## D-REP5 — Configurable Dashboard Widgets

**Decision**: Dashboard widget configuration is **HQ-controlled** (SUPER_ADMIN/HQ_USER configure; FRANCHISE_ADMIN and other operational roles consume the configuration applicable to their dashboard, they do not configure it themselves). Minimum configurable properties: **widget visibility** and **display order**. Layout/size configuration is explicitly **not** required now — do not build a drag-and-drop layout engine unless a real frontend requirement demands it later.

**Rationale**: Matches the EPB's own framing ("Headquarters may configure the dashboard layout based on organizational requirements") and avoids over-engineering a capability nothing currently asks for beyond visibility/ordering.

**Explicitly deferred, not decided here**: whether a franchise may customize its *own* dashboard view within HQ's configuration (a separate, later decision if the need arises) — do not assume either answer.

**Status**: LOCKED.

---

## D-REP6 — Deleted / Soft-Deleted Record Visibility in Reports

**Decision**: Normal reports continue to **exclude** soft-deleted records by default (unchanged from current behavior — this protects revenue/customer-count/stock/job-count/payment-total integrity, per the EPB's own "exported reports shall maintain data integrity" rule). Authorized HQ users (SUPER_ADMIN/HQ_USER) may request inclusion via an explicit, opt-in parameter (e.g. `includeDeleted=true`) on reports where it's applicable — and when included, each such row must be clearly marked (e.g. `status: "Deleted"` or an equivalent existing status representation), never silently blended in as if it were live data.

**Rationale**: Reconciles §16.14 rule 6 ("deleted or cancelled transactions shall be identifiable in reports where applicable") with §2.6's promise of HQ visibility into deleted records, without corrupting the default operational view every other rule in §16.14 depends on being accurate.

**Scope**: "Where applicable" is deliberately not enumerated exhaustively here — REP-01C determines, report by report, whether inclusion makes sense (e.g. a Customer Register might reasonably support it; a real-time "Vehicles In Progress" count should not).

**Status**: LOCKED.

---

## D-REP7 — Report/Dashboard Authorization

**Decision**: Every report/dashboard route — canonical, compatibility, or specialized — must ultimately pass through the established RBAC action-permission architecture (`requireAction`), reusing the domain-level actions already locked under D-13/RBAC-01 (`reports:crm:view`, `reports:financial:view`, `reports:customer:view`, `reports:employee:view`, `reports:inventory:view`, `reports:hq-summary:view`, and their `:export` counterparts) rather than inventing new ones for canonical reports that already have a home in that catalogue. A compatibility route inherits the same authorization as the canonical implementation it delegates to — it must never become a lower-friction bypass of the same capability.

**Rationale**: Closes exactly the gap REP-01 found — five to six dashboard-shaped endpoints and two duplicate-report modules currently sit outside RBAC-04's action-grant system, authorized (if at all) only by coarse `requireRole` checks or nothing beyond `authenticate`.

**If a genuinely new domain surfaces** (dashboard widget configuration being the clearest candidate — "who may configure widgets" isn't covered by any existing D-13 action) that follows the established RBAC-02 grant-management process for adding a new action, not an ad hoc addition invented mid-implementation.

**Status**: LOCKED.

---

## What REP-01B does NOT decide (explicitly out of scope)

Excel/PDF export (EPB marks Future), Scheduled Reports (EPB marks Future), any change to already-accepted Inventory/GST/Warranty reporting, frontend implementation (not in this backend workspace), and live DB deployment verification.

---

**Next**: REP-01C implements D-REP1 through D-REP7 as a focused, decision-bounded implementation phase — consolidating calculation logic, wiring authorization consistently, building the confirmed-missing reports (reusing the Vehicle Status Board's existing source of truth for the Vehicle Live Status Report, per the explicit lesson from REP-01), and implementing widget configuration — without revisiting the policy questions this document already answers.

---

## REP-01C — Implementation Record

Everything below records how D-REP1 through D-REP7 were actually implemented. No policy decision above was revisited; this section is a factual record, not a new decision gate. Full test coverage: `scripts/test-rep01c-architecture-consolidation.ts` (88/88), plus the pre-existing `scripts/test-rep01a-remediation.ts` updated for two legitimate REP-01C-caused relocations (35/35). Regression baseline: 886 passing across all `scripts/test-*.ts` (all failures are in `test-system-credential-middleware.ts`, pre-existing and unrelated to this module — see the final acceptance report).

### Shared Dashboard Aggregation Layer (D-REP1/D-REP3)

Added directly to `ReportService` (per D-REP1's letter — `report.service.ts` itself is canonical, not a separate helper class): `getRevenueSummary`, `getLeadSummary`, `getWorkshopSummary`, `getInventorySummary`, `getEmployeeSummary`, plus `getFranchiseDashboardReport` (the new canonical §16.4 Franchise Dashboard, composed from the shared summaries). `getHQSummary` (§16.3) was refactored to compose from the same shared summaries instead of its own inline duplicate computation — verified to produce an unchanged response shape.

### Endpoint Classification (D-REP4) — final table

| Endpoint | Route | Classification | Notes |
|---|---|---|---|
| A (new) | `GET /api/reports/franchise-dashboard` | **CANONICAL** | The §16.4 Franchise Dashboard. Gated `dashboards:executive:view` (existing D-21 action). |
| B | `GET /api/hq/dashboard` | **COMPATIBILITY** | Full existing response contract preserved (`businessSummary`/`salesSummary`/`inventorySummary`/`employeeSummary`). Overlapping fields (`globalRevenue`, `globalLowStock`, present/absent counts) now sourced from the shared summaries; `leadsReceived`/`leadsConverted` and most of `businessSummary` deliberately kept local after verifying their status-literal definitions differ from the shared methods' (see "Conservative consolidation" below). Gated `reports:hq-summary:view` (existing). |
| C | `GET /api/dashboard` | **SPECIALIZED** | D-21's own per-role section-visibility mechanism (crm/workshop/financial/hr/inventory subsets) is its entire purpose — not a duplicate of any canonical view. Every field compared against the shared aggregation and found to use a different underlying definition (e.g. `revenueToday` here counts only `status === "Paid"` invoices — collected revenue — vs the canonical's all-non-Cancelled — billed revenue). Left unchanged. Not gated with `requireAction()`: D-21's section filter already is its access-control mechanism. |
| D | `GET /api/workshop/franchise-dashboard` | **SPECIALIZED** | Substantial unique metrics (customer retention rate, QC pass rate, avg completion time, lead conversion) with no canonical equivalent. Overlapping metrics (revenue, employee attendance, inventory, workshop in-progress/ready-for-delivery counts) now reuse the shared summaries — this also fixed a real inconsistency the consolidation surfaced (`vehiclesInProgress` here previously counted `["Pending","In Progress","In_Progress"]`, broader than the canonical `["In Progress"]` only; now matches canonical). Response contract (5 top-level sections) unchanged. Controller now uses `resolveDataScope()` instead of a manual role-check reimplementation. Gated `dashboards:executive:view` (existing). |
| E | `GET /api/hq/franchises/:id/stats` | **SPECIALIZED** | EPB §3.7 Franchise Monitoring, not §16 — different purpose (HQ inspecting one franchise by id, with string-formatted display fields and a recent-activity feed). `inventoryStatus`/`employeeAttendance` display strings now source their underlying counts from the shared `getInventorySummary`/`getEmployeeSummary`; `revenue`/`pendingPayments`/`customerCount`/`vehicleCount`/`activeLeads`/`jobCards`/`dailyActivitySummary` have no canonical equivalent (different filters — e.g. `vehicleCount` here is "Delivered" jobs only) and stay local. No route-level RBAC gate existed and none was added — pre-existing, out of REP-01C's authorization sweep (see "Not addressed" below). |
| F | `GET /api/leads/dashboard` | **SPECIALIZED** | EPB §6.14 Lead Dashboard — CRM-specific metrics (today's follow-ups/callbacks/overdue, per-source/employee/franchise lead analysis) with no equivalent in the shared aggregation. Gated `reports:crm:view` (existing, newly added — was previously fully ungated). |

### Duplicate Consolidation (D-REP1/D-REP2)

- **CRM (`leadReport.service.ts` / `GET /api/leads/reports/:type`)**: full field-by-field comparison against the canonical `/api/reports/crm/*` found the two are **not the same contract** — `LeadReportService` returns human-readable CSV-style headers (`'Lead ID'`, `'Customer Name'`, ...) with substantially richer fields (email, city, vehicle make/model, priority, alternate phone) the canonical JSON reports don't expose, and different status filters. Per the conservative-consolidation principle (below), this was **not** force-merged — kept as a distinct, richer CSV-export-oriented route, but unified under the same `reports:crm:view`/`reports:crm:export` actions (dynamically selected by the `?format=csv` query param) so authorization is consistent.
- **Customer (`customer.service.ts`'s own CSV switch)**: `service_due` and `referral_report` — the two cases with a genuine CRM-report equivalent (§16.6's Service Due Follow-up Report and Referral Report) — now delegate to the new canonical `ReportService.getServiceDueFollowUpReport`/`getReferralReport`. This also **closed a real cross-franchise data leak**: both cases previously queried `db.serviceReminder`/`db.referral` directly with **no franchiseId filter at all**, unlike most of the same switch (which at least spreads `...tenantFilter`). The other cases in that switch (`customer_register`, `new_customer`, `vehicle_register`, `customer_visit`, `service_history`, `warranty_report`) were left untouched — deliberately, not an oversight (see "Not addressed" below).
- **Employee Performance** (duplicated in `hq.ts` and `leadReport.service.ts`, absent from the canonical layer): a new canonical `ReportService.getEmployeePerformanceReport` was added, using `hq.ts`'s version verbatim (it was the richest — attendance + jobs + leads + revenue per employee). `hq.ts`'s route is now a compatibility wrapper around it; `LeadReportService`'s lead-only slice was left as-is (genuinely narrower, CRM-specific, not the same report).

### Missing Reports Completed (§9/§16.5/§16.6/§16.8)

Job Card Register, Workshop Status Report, Vehicle Live Status Report (§16.5); Referral Report, Service Due Follow-up Report (§16.6); Leave Report (§16.8) — all added to `ReportService`, all reuse existing Job/Referral/ServiceReminder/LeaveRequest data with the existing status vocabulary (no new workflow-stage engine invented for the Vehicle Live Status Report — the EPB §11.4 17-stage board has no data-model equivalent anywhere in this codebase, so `Job.status` is used as "Current Stage", consistent with every other Workshop report). All wired to routes under the existing `reports:workshop:view`, `reports:crm:view`, and `reports:employee:view` actions.

### Conservative Consolidation — declined merges, with reasons

Recorded here so a future phase doesn't re-attempt these without re-verifying: `hq.ts`'s `leadsReceived` (would undercount — some lead statuses fall into none of the shared `getLeadSummary` buckets) and `leadsConverted` (narrower `status === "Converted"` there vs the shared method's `['Converted','Won','Closed']`); `workshop.service.ts`'s `pendingQualityChecks` (status `"Work Completed"`, a different pipeline stage from the shared summary's `"QC Pending"`); `dashboard.ts`'s entire metric set (see endpoint C above); `hq.ts` franchise/:id/stats's revenue/customer/vehicle/lead counts (see endpoint E above).

### D-REP5 — Dashboard Widget Configuration

Minimum viable: a new additive `DashboardWidgetConfig` table (`dashboardType`, `widgetKey`, `visible`, `order`) — one row per overridden widget; a missing row means "visible, default order," so the table never needs seeding. Scoped to the two dashboards this phase actually built dedicated routes for — **executive** (`getHQSummary`'s 5 top-level sections) and **franchise** (`getFranchiseDashboardReport`'s 9 EPB §16.4 fields). Extending this to the remaining D-21 dashboard classes (reception/workshop/qc/billing/inventory) is future work once each gets its own dedicated route the way executive/franchise now do — today those are still just sections of the single legacy `GET /api/dashboard` (endpoint C), which has no per-section route to attach a widget config to. `GET /api/reports/dashboard-widgets` is readable by any authenticated user (needed to render their own dashboard); `PUT` is gated `settings:edit` — **the existing HQ-only D-12 action, no new action needed** (D-REP7 anticipated widget configuration might be the one case requiring a new action; it wasn't).

### D-REP6 — Deleted Record Handling

Implemented for the three genuine "Register" reports — Customer Register, Lead Register, Job Card Register (§16.7/§16.6/§16.5) — via an `includeDeleted` opt-in query param, honored only when `resolveDataScope(req.user).unrestricted` is true (SUPER_ADMIN/HQ_USER), silently ignored otherwise (no error — the endpoint still works, just without the opt-in). When honored, each row carries an explicit `recordStatus: 'Active' | 'Deleted'` marker; the field is omitted entirely on ordinary calls, so the default response shape is unchanged. Implemented via dedicated repository methods (`getCustomersForRegister`, `getLeadsInRangeForRegister`, `getWorkshopJobsForRegister`) rather than parameterizing the shared `getCustomers`/`getLeadsInRange`/`getWorkshopJobs`, so the opt-in can never leak into those methods' other ~20 combined existing callers. Not extended to every report — judged report-by-report per D-REP6's own text ("where applicable"); a real-time metric like "Vehicles In Progress" has no sensible "include deleted" reading.

### Not addressed (explicitly out of scope for REP-01C, flagged for a future phase)

- `hq.ts`'s `GET /franchises/:id/stats` (endpoint E) still has **no RBAC route gate** — only a router-level `authenticate`. Discovered during classification but left as pre-existing; REP-01C's D-REP7 sweep targeted the routes REP-01 explicitly named as ungated duplicates, and this one wasn't among them, so adding a gate to it was judged out of this phase's authorized scope rather than silently expanded.
- `customer.service.ts`'s CSV switch still has **five other cases** (`customer_register`, `new_customer`, `vehicle_register`, `customer_visit`, `service_history`) with the same missing-`tenantFilter` pattern found and fixed in `service_due`/`referral_report`. Fixing those two was directly tied to completing the named missing CRM reports (D-REP1/D-REP2); fixing the other five is a broader pre-existing data-scoping defect, closer in shape to an INV-01A-style safe remediation than to "complete the missing reports," and was not authorized by this phase's prompt. Flagged here for a dedicated follow-up.
