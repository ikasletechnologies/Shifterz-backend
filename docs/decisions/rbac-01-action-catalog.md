# RBAC-01 — Action Catalog

Derived strictly from [`docs/decisions/rbac-decisions.md`](./rbac-decisions.md) (D-08–D-21, all locked)
plus a direct inventory of the actual protected routes/controllers/services in this backend.

**Scope of this document**: catalog definition only.
- No `RolePermission.actions` data is seeded here (RBAC-02).
- No `requireAction()` is added to any route here (RBAC-03/04).
- No migration is created — every column this catalog will eventually populate
  (`RolePermission.actions`, `UserPermission.actions`/`actionsOverride`) already
  exists in `schema.prisma`.
- Where a route/service had an independent security defect (client-controlled
  identity, missing tenant-isolation check) discovered during this inventory,
  it was fixed immediately and recorded under the relevant D-number in
  `rbac-decisions.md` — that is a data-scope/identity-integrity fix, not RBAC
  action-catalog work, and is not repeated here except by reference.

**Naming convention**: `resource:verb`, occasionally `resource:sub-resource:verb`
for a scope-qualified capability (e.g. `members:transfer:approve`). This matches
the convention already implied by the illustrative examples in
`scripts/test-action-permission-resolver.ts` (`jobs:view`, `jobs:edit`,
`billing:view`, `employees:view`, `employees:create`) — none of those were
real seeded grants (`RolePermission.actions` is `[]` for every role today),
just naming precedent, preserved here rather than invented fresh.

---

## 1. Action catalog, by decision

Each entry: **action** — resource/verb, roles (from the locked decision), scope
behavior, read/write/admin/approval class, and status.

### D-08 — Job Assignment Authority

| Action | Roles | Scope | Class | Status |
|---|---|---|---|---|
| `jobs:assign` | SUPER_ADMIN, HQ_USER (global), FRANCHISE_ADMIN (own franchise) | franchise-scoped via `resolveDataScope()` on the job's franchise | write/admin | **Needs finer granularity** — no dedicated assign endpoint exists. `technicianId`/`serviceAdvisorId` are fields inside the generic `updateJobCardSchema` (`PUT /jobs/:id`), the same endpoint used for every other job-detail edit. Today there is no way to separately authorize "edit job details" vs. "(re)assign a job" — `requireAction('jobs:assign')` cannot be applied to a whole route without also gating unrelated fields. Splitting assignment into its own request path (or field-level authorization inside `updateJob`) is implementation work for RBAC-04, not decided here. |

### D-09 — Outpass Approval

| Action | Roles | Scope | Class | Status |
|---|---|---|---|---|
| `outpass:approve` | SUPER_ADMIN, HQ_USER (global), FRANCHISE_ADMIN (own franchise) | franchise-scoped | approval | **Already represented as a distinct route** — `POST /outpass/:id/approve` and `/reject` are separate endpoints from generic `PUT /outpass/:id`, so `requireAction()` can gate this cleanly once RBAC-03/04 exist. No route-level role check exists yet (verified: `outpassRouter` has no `requireRole()`). |

### D-10 — Invoice Cancellation

| Action | Roles | Scope | Class | Status |
|---|---|---|---|---|
| `billing:cancel` | SUPER_ADMIN, HQ_USER (global), FRANCHISE_ADMIN (own franchise) | franchise-scoped via `resolveDataScope()`, already enforced in `BillingService.cancelInvoice` | write/admin | **Already represented, isolated route.** `cancelInvoice` is a distinct service method reachable through its own route, not merged into generic invoice update — clean `requireAction()` target. |

### D-11 — Refund Authority

| Action | Roles | Scope | Class | Status |
|---|---|---|---|---|
| `payments:refund` | SUPER_ADMIN, HQ_USER (global), FRANCHISE_ADMIN (own franchise) | franchise-scoped via `resolveDataScope()` | write/admin | **Already represented, isolated route** (`POST /payments/refund`, distinct from `createPayment`). Identity-integrity defect (`approvedBy` spoofing) already fixed under D-11 in the decision register — unrelated to this catalog entry. |

### D-12 — Settings Edit

| Action | Roles | Scope | Class | Status |
|---|---|---|---|---|
| `settings:edit` | SUPER_ADMIN, HQ_USER (global only — no franchise-scoped settings exist) | global | admin | **Already represented, single route** (`PUT /settings`). |
| `tax:edit` (candidate) | TBD | TBD | admin | **Deferred** — `TaxMaster`/HSN-SAC master have no dedicated route/controller found in this inventory; GST rate config currently flows through the general `settings` resource. Only create as its own action if/when a dedicated tax-master CRUD surface is built. |
| `services:edit` (candidate) | SUPER_ADMIN, HQ_USER | global (Service is not franchise-scoped) | admin | **Already represented, separate from `settings:edit`** — `serviceRouter` (`POST`/`PUT`/`DELETE /services`) already has its own `requireRole("SUPER_ADMIN","HQ_USER")` gate, structurally independent of the `settings` resource. Recommend keeping `services:edit` distinct rather than folding it under `settings:edit`, since D-12's text explicitly anticipated this split. |

### D-13 — Reports / Export

| Action | Roles | Scope | Class | Status |
|---|---|---|---|---|
| `reports:view` / `reports:export` (generic) | Not created — see domain split below | — | — | Rejected in favor of domain-specific actions, per D-13's own text. |
| `reports:billing:view` / `:export` | SUPER_ADMIN/HQ_USER (global + consolidated), FRANCHISE_ADMIN/BRANCH_MANAGER/BILLING_EXECUTIVE (own franchise) | franchise-scoped via `ReportController.resolveScope()` (deduplicated onto `resolveDataScope` in GST-11) | read/export | **Required by D-13, not yet enforced** — routes exist (`/reports/billing/*`, including `gst-summary`, `gstr1`, `gstr3b`), zero role gating today. |
| `reports:reception:view` / `:export` | SUPER_ADMIN/HQ_USER/FRANCHISE_ADMIN/BRANCH_MANAGER/RECEPTION-adjacent roles | franchise-scoped | read/export | **Required, not yet enforced.** Routes: `/reports/reception/*`. |
| `reports:workshop:view` / `:export` | SUPER_ADMIN/HQ_USER/FRANCHISE_ADMIN/BRANCH_MANAGER | franchise-scoped | read/export | **Required, not yet enforced.** Routes: `/reports/workshop/*`. |
| `reports:qc:view` / `:export` | SUPER_ADMIN/HQ_USER/FRANCHISE_ADMIN/BRANCH_MANAGER/QUALITY_INSPECTOR | franchise-scoped | read/export | **Required, not yet enforced.** Routes: `/reports/qc/*`. |
| `reports:crm:view` / `:export` | SUPER_ADMIN/HQ_USER/FRANCHISE_ADMIN/BRANCH_MANAGER | franchise-scoped | read/export | **Required, not yet enforced.** Routes: `/reports/crm/*`. |
| `reports:customer:view` / `:export` | SUPER_ADMIN/HQ_USER/FRANCHISE_ADMIN/BRANCH_MANAGER | franchise-scoped | read/export | **Required, not yet enforced.** Routes: `/reports/customer/*`. |
| `reports:employee:view` / `:export` | SUPER_ADMIN/HQ_USER/FRANCHISE_ADMIN | franchise-scoped | read/export | **Required, not yet enforced.** Routes: `/reports/employee/*`. |
| `reports:financial:view` / `:export` | SUPER_ADMIN/HQ_USER (global), FRANCHISE_ADMIN/BILLING_EXECUTIVE (own franchise) | franchise-scoped | read/export | **Required, not yet enforced.** Routes: `/reports/financial/*`. Note: a *second*, structurally separate financial export lives in `hq.ts` (`/api/hq/reports/financial/export`), already gated by `hqRouter`'s blanket `requireRole("SUPER_ADMIN","HQ_USER")` — not the same route, do not conflate when wiring RBAC-04. |
| `reports:inventory:view` / `:export` | SUPER_ADMIN/HQ_USER/FRANCHISE_ADMIN/INVENTORY_EXECUTIVE | franchise-scoped | read/export | **Required, not yet enforced.** Routes: `/reports/inventory/*`. |
| `reports:hq-summary:view` | SUPER_ADMIN, HQ_USER only | global | read | **Required, not yet enforced.** Route: `/reports/hq-summary` — currently reachable by any authenticated user despite being HQ-consolidated data; this is the one report sub-resource D-13 explicitly says should NOT be franchise-accessible at all, worth prioritizing in RBAC-04's rollout order. |

### D-14 — Attendance Edit

| Action | Roles | Scope | Class | Status |
|---|---|---|---|---|
| `attendance:edit` | SUPER_ADMIN, HQ_USER (global), FRANCHISE_ADMIN (own franchise) | franchise-scoped — **now enforced directly in `AttendanceService.updateAttendance`** (fixed during this inventory, see D-14 in the decision register) | write/admin | **Partially enforced already** — the tenant-isolation/role-eligibility boundary is now hard-coded inline (not yet action-based). `requireAction('attendance:edit')` in RBAC-04 would be layered on top of, not replacing, this check — or the inline check can be removed once RBAC-04 exists and grants are seeded correctly. Decide at RBAC-04 time. |
| `attendance:self:checkin` / `:checkout` (candidate) | any authenticated employee, self only | actor-identity-scoped, not franchise-scoped | write | **Already correctly isolated** — `checkIn`/`checkOut` now always use `req.user.id` (fixed during this inventory). Whether this needs a formal action at all is questionable, since it's inherently self-scoped regardless of role; flagged as a candidate for RBAC-01 review rather than assumed necessary. |

### D-15 — Leave Approval

| Action | Roles | Scope | Class | Status |
|---|---|---|---|---|
| `leave:approve` | SUPER_ADMIN, HQ_USER (global), FRANCHISE_ADMIN (own franchise) | franchise-scoped via inline check in `LeaveService.updateLeaveStatus` | approval | **Partially enforced already** — self-approval block and franchise check are inline (fixed during the D-15 lock), role-eligibility (blocking non-SUPER_ADMIN/HQ_USER/FRANCHISE_ADMIN entirely) is NOT yet enforced — `leaveRouter` has no `requireRole()`. **Required by RBAC-04.** |

### D-16 — Member Transfer Approval

| Action | Roles | Scope | Class | Status |
|---|---|---|---|---|
| `members:transfer:approve` | SUPER_ADMIN, HQ_USER only (global) | global (HQ-level control, no franchise scoping applicable) | approval | **Already fully enforced in code** — `TransferService.approveTransfer`/`rejectTransfer` already throw 403 for non-SUPER_ADMIN/HQ_USER. This action can be wired to `requireAction()` in RBAC-04 with no further service-layer change needed. |

### D-16B — Member Transfer Initiation/Edit/Soft-Delete

**Parked.** Not catalogued. `TransferRouter`'s `POST /`, `PUT /:id`, `DELETE /:id` currently have no role restriction at all — noted for whenever D-16B is decided, not before.

### D-17 — Workflow Stage Administration

| Action | Roles | Scope | Class | Status |
|---|---|---|---|---|
| `workflow:stages:manage` | SUPER_ADMIN, HQ_USER (global), FRANCHISE_ADMIN (own franchise) | franchise-scoped — **now enforced on update/delete** via `assertWithinScope` (fixed during D-17 lock) | admin | **Partially enforced already.** `createStage`'s role check is looser than this action implies (any non-HQ role with a `franchiseId` may create a franchise-scoped stage, not just FRANCHISE_ADMIN) — role-eligibility narrowing is RBAC-04's job. |

### D-18 — QC Template Administration

| Action | Roles | Scope | Class | Status |
|---|---|---|---|---|
| `qc:templates:manage` | SUPER_ADMIN, HQ_USER (global), FRANCHISE_ADMIN (own franchise) | franchise-scoped — **now enforced on update/delete** via `assertWithinScope` (fixed during D-18 lock) | admin | **Partially enforced already**, identical status to D-17's `workflow:stages:manage`. |
| `qc:templates:view` / `qc:templates:use` (candidate) | QUALITY_INSPECTOR + everyone with QC execution access | franchise-scoped (same as `getChecklistTemplate`) | read | **Deferred** — template *use* during actual QC execution is a separate action from *administering* the template; `getChecklistTemplate` currently has no role gate at all (any authenticated user), which is consistent with D-18's "operational roles may use" language, so likely correctly left ungated rather than needing a new action — confirm at RBAC-04. |

### D-19 — Cross-Franchise Vehicle History

| Action | Roles | Scope | Class | Status |
|---|---|---|---|---|
| `vehicles:history:view` | All operational roles (explicit list in the decision — every role, no exclusions) | **explicit cross-franchise exception** — must not be implemented by weakening `resolveDataScope()` globally; the route (`GET /customers/vehicles/:vehicleNo/history`) intentionally omits the tenant filter at the query level, and that must stay local to this one action | read | **Already correctly implemented, matches decision exactly** (verified during D-19 lock — no code change was needed). When RBAC-04 wires this in, the action grant should be universal across all listed roles; the *scope* exception is structural (the query itself), not something `resolveActionPermissions` needs special-casing for. |

### D-20 — Scheduler / System Credential Architecture

**Not part of this action catalog.** D-20 is system-to-system authorization (`SYSTEM_SCHEDULER` identity), structurally separate from `resolveActionPermissions`/`UserPermission`/`RolePermission`, which are keyed to `Employee`. No `scheduler:*` action should ever appear in `RolePermission.actions` for a human role — see D-20's own text. Endpoints affected: `POST /api/callbacks/reminders/dispatch`, the workshop periodic endpoint. Architecture only; no implementation exists yet (by design, per D-20).

### D-21 — Executive / Reception Dashboards

| Action | Roles | Scope | Class | Status |
|---|---|---|---|---|
| `dashboards:executive:view` | SUPER_ADMIN, HQ_USER (global), FRANCHISE_ADMIN/BRANCH_MANAGER (own franchise) | franchise-scoped | read | **Required by D-21, does not exist in code.** No route split exists — see below. |
| `dashboards:reception:view` | RECEPTION, SERVICE_ADVISOR (+ management roles) | franchise-scoped | read | **Required, does not exist.** |
| `dashboards:workshop:view` | TECHNICIAN (+ management roles) | franchise-scoped, limited to assigned/workshop info | read | **Required, does not exist.** |
| `dashboards:qc:view` | QUALITY_INSPECTOR (+ management roles) | franchise-scoped | read | **Required, does not exist.** |
| `dashboards:billing:view` | BILLING_EXECUTIVE (+ management roles) | franchise-scoped | read | **Required, does not exist.** |
| `dashboards:inventory:view` | INVENTORY_EXECUTIVE (+ management roles) | franchise-scoped | read | **Required, does not exist.** |

**Status note**: the current implementation is a single endpoint (`GET /api/dashboard`, plus `GET /employee/:id`) returning all metric categories together to any authenticated user, tenant-scoped only. None of the six actions above can be individually enforced without first splitting this endpoint (or filtering its response by role) — substantial build work, explicitly out of scope for RBAC-01/02/03 and deferred to RBAC-04 or a dedicated follow-up phase, consistent with D-21's own text.

---

## 2. Existing protections not covered by any D-08–D-21 topic

Found during the route inventory; real, already-enforced authorization that D-08–D-21 doesn't name. Listed for completeness, not assigned an action name here — that's a gap in decision coverage, not something to invent an action for unilaterally.

| Area | Current enforcement | Notes |
|---|---|---|
| Franchise CRUD (`franchiseRouter`, `hq.ts` franchise routes) | `requireRole("SUPER_ADMIN","HQ_USER")` | No locked decision names this; likely candidate `franchise:manage` if/when a D-2X gets written for it. |
| Service Master create/update/delete (`serviceRouter`) | create/update: `requireRole("SUPER_ADMIN","HQ_USER")`; delete: `SUPER_ADMIN` only (Step 3 Item #3) | Candidate `services:edit` / `services:delete` — partially covered under D-12's own text as a candidate, see above. |
| Invoice hard-delete (Step 3 Item #1) | `SUPER_ADMIN` only, inline in `BillingService.deleteInvoice` | Candidate `billing:delete`. |
| HQ generic permanent-delete (Step 3 Item #2) | `requireRole("SUPER_ADMIN")` on `hq.ts` route | Candidate `records:purge` or similar. |
| Employee creation privilege escalation block (Step 3 Item #6) | inline in `EmployeeService.createEmployee` — only `SUPER_ADMIN` may create a `SUPER_ADMIN` employee | Candidate `employees:create:super_admin` as a distinct, narrower action from `employees:create`. |

None of these are acted on in this catalog — they're flagged so RBAC-02/04 don't accidentally leave them uncovered, and so a future decision series knows these exist as unnamed gaps in D-08–D-21's coverage.

---

## 3. Summary — status counts

- **Required by a locked decision, not yet enforced at all**: D-13 (7 domains + hq-summary), D-15 (role-eligibility), D-17/D-18 (role-eligibility beyond the now-fixed tenant check), D-21 (all 6, blocked on a dashboard-splitting build).
- **Already fully enforced in code, ready for a direct `requireAction()` swap-in at RBAC-04**: D-16 (`members:transfer:approve`), D-19 (`vehicles:history:view`).
- **Partially enforced (tenant-isolation fixed this session, role-eligibility still open)**: D-09, D-10, D-11, D-14, D-17, D-18.
- **Needs a design decision before it can become one action**: D-08 (`jobs:assign` — no isolated route; bundled into generic job update).
- **Explicitly out of this catalog**: D-20 (system credential, not human RBAC), D-16B (parked).

## 4. Explicitly not done in RBAC-01

- No `RolePermission.actions` rows populated (RBAC-02, requires a live DB — deferred to VPS stage like every other DB-touching change in this engagement).
- No `requireAction()` middleware written or attached to any route (RBAC-03/04).
- No migration — every field this catalog references already exists in `schema.prisma`.
- No resolution of the "existing protections not covered by D-08–D-21" gaps listed in §2 — those need their own decision, not an invented action.
