# RBAC Decision Register (D-08 – D-21)

Durable record of the role/action authorization decisions underpinning the
action-permission model (`src/lib/auth.ts` — `resolveActionPermissions`).

Status: re-locked from scratch in this session. The original D-08–D-21
decisions were made earlier in this same conversation but never persisted to
a durable record; only a lossy AI-generated paraphrase survived context
compaction. Rather than trust that paraphrase for real access-control
grants, each decision below was re-confirmed explicitly, decision by
decision, before being recorded here. Where a decision is a genuinely new
determination (derived from the ERP's architecture, not a recollection of
original wording), that is noted.

RBAC-01 (the action catalog) is derived strictly from this file once all 14
are locked. No permission seed (RBAC-02) or route enforcement (RBAC-03/04)
is generated until then.

---

## D-08 — Job Assignment Authority

**Who**
- `SUPER_ADMIN` — can assign and reassign jobs.
- `HQ_USER` — can assign and reassign jobs.
- `FRANCHISE_ADMIN` — can assign and reassign jobs within their own franchise.
- Other operational roles — cannot assign/reassign jobs merely because they can work on or view jobs.

**Scope**
- `SUPER_ADMIN`: global / all franchises
- `HQ_USER`: global / all franchises
- `FRANCHISE_ADMIN`: own franchise only

**Conditions**
- The actor must have access to the job's franchise through the normal data-scope rules.
- A `FRANCHISE_ADMIN` cannot assign or reassign a job belonging to another franchise.
- The target employee/technician must be valid for the target job's franchise; assignment must not be used to create an implicit cross-franchise employee relationship.
- Reassignment follows the same authority rules as initial assignment; there is no weaker permission for reassignment.
- Existing workflow/state rules still apply. Job-assignment authority does not grant authority to bypass QC, billing, completion, or other lifecycle controls.

**Exceptions**
- `SUPER_ADMIN` and `HQ_USER` retain cross-franchise assignment authority.
- No blanket cross-franchise assignment authority is granted to `FRANCHISE_ADMIN`.

**RBAC implication**
- Primary action: `jobs:assign` (covers both initial assignment and reassignment — no separate `jobs:reassign` unless the business later requires different authorization for it).
- The action answers "may this role perform assignment?"; `resolveDataScope()` answers "which jobs/franchise may they perform it on?" — the two controls stay separate.

**Basis**: new determination derived from the ERP's established architecture and the purpose of D-08. The available record confirms only that D-08 concerns job-assignment authority, not the original wording.

**Status**: LOCKED.

---

## D-09 — Outpass Approval

**Who**
- `SUPER_ADMIN` — can approve outpasses.
- `HQ_USER` — can approve outpasses.
- `FRANCHISE_ADMIN` — can approve outpasses within their own franchise.
- `BRANCH_MANAGER` — cannot approve outpasses.
- Other operational roles — cannot approve outpasses.

**Scope**
- `SUPER_ADMIN`: global / all franchises.
- `HQ_USER`: global / all franchises.
- `FRANCHISE_ADMIN`: own franchise only.

**Conditions**
- Approval is subject to the normal franchise/data-scope rules.
- The approver must have access to the outpass's franchise.
- Approval authority does not bypass the vehicle-delivery prerequisites: job completed, QC passed, invoice generated, payment completed or approved credit — then outpass approval.
- The approval action must be audit-tracked.

**Exceptions**
- No `BRANCH_MANAGER` approval authority.
- `FRANCHISE_ADMIN` does not receive cross-franchise approval authority.

**RBAC implication**
- Primary action: `outpass:approve`.
- The action controls whether the actor may approve an outpass; normal data scope controls which franchise/outpass records they may approve.

**Basis**: fresh determination from the established Shifterz authorization architecture, not a claim that the original wording was recovered.

**Status**: LOCKED.

---

## D-10 — Invoice Cancellation

**Who**
- `SUPER_ADMIN` — can cancel invoices.
- `HQ_USER` — can cancel invoices.
- `FRANCHISE_ADMIN` — can cancel invoices within their own franchise.
- Other roles — cannot cancel invoices.

**Scope**
- `SUPER_ADMIN`: global / all franchises.
- `HQ_USER`: global / all franchises.
- `FRANCHISE_ADMIN`: own franchise only.

**Conditions**
- Cancellation requires a mandatory cancellation reason.
- An invoice must not be cancellable if it is paid or partially paid.
- Cancellation must be performed through the canonical invoice-cancellation workflow.
- Generic invoice update operations must not be able to change an invoice to Cancelled.
- A cancelled invoice is retained for audit/history; cancellation is not equivalent to deletion.
- Cancellation must be audit-tracked with the actor, timestamp, reason, and relevant before/after state.
- Existing invoice lifecycle and franchise-scope checks remain mandatory.

**Exceptions**
- No `BRANCH_MANAGER` cancellation authority.
- No cross-franchise cancellation authority for `FRANCHISE_ADMIN`.
- The separate permanent-delete policy remains distinct from cancellation; cancellation itself does not authorize deletion.

**RBAC implication**
- Primary action: `billing:cancel`.
- The action controls whether the actor may cancel an invoice. Data scope controls which invoice/franchise they may act upon.

**Basis**: fresh determination; confirmed consistent with the existing `cancelInvoice` implementation (`billing.service.ts`) — paid/partially-paid block, mandatory reason, scope-checked, audit-logged.

**Status**: LOCKED.

---

## D-11 — Refund Authority

**Who**
- `SUPER_ADMIN` — can approve/process refunds.
- `HQ_USER` — can approve/process refunds.
- `FRANCHISE_ADMIN` — can approve/process refunds within their own franchise.
- Other roles — cannot authorize refunds.

**Scope**
- `SUPER_ADMIN`: global / all franchises.
- `HQ_USER`: global / all franchises.
- `FRANCHISE_ADMIN`: own franchise only.

**Conditions**
- Refund must relate to a valid original payment/receipt.
- Refund requires an explicit reason.
- The refund actor must have access to the relevant franchise through normal data-scope rules.
- `approvedBy` must come from the authenticated authorized actor, not from client-supplied identity.
- Refund activity must be audit-tracked.
- Refund authority does not automatically grant invoice-cancellation or invoice-deletion authority; those remain separate actions/policies.
- Existing payment/refund validation remains in force.

**Exceptions**
- No `BRANCH_MANAGER` refund authority.
- No cross-franchise refund authority for `FRANCHISE_ADMIN`.
- Existing refund workflow remains the canonical path; RBAC governs authorization, not a parallel refund mechanism.

**RBAC implication**
- Primary action: `payments:refund`.
- The action answers "may this actor authorize/process a refund?" while `resolveDataScope()` answers "for which payment/franchise?"

**Implementation gap found and closed during this lock**: `PaymentsController.createRefund` previously destructured `approvedBy` directly from `req.body` and passed it through unchanged — client-controlled, contradicting this decision's own text. Fixed in `payments.controller.ts`: `approvedBy` is now derived from `req.user?.id`, and the client-supplied value is never read. Confirmed `authenticate` (`auth.middleware.ts`) unconditionally sets `req.user.id` from the verified session for every request that reaches this handler (the middleware 401s first on any invalid/expired/revoked session), and that `paymentsRouter` applies `authenticate` before `/refund` — so the `'unknown'` fallback is defensive/unreachable, not a real identity substitution; the earlier `|| req.user?.username` fallback was removed to avoid conflating username with actor id. Verified via `npm run build` (clean), `test-gst-calculation-engine.ts` (27/27), `test-action-permission-resolver.ts` (6/6), no migration created, and a static check confirming `req.body.approvedBy` has no remaining reference in the controller.

**Status**: LOCKED (implementation gap closed).

---

## D-12 — Settings Edit

**Who**
- `SUPER_ADMIN` — may edit settings.
- `HQ_USER` — may edit settings.
- `FRANCHISE_ADMIN` — cannot edit controlled settings.
- Other roles — cannot edit settings.

**Scope**
- `SUPER_ADMIN`: global.
- `HQ_USER`: global.
- No franchise-level settings-edit authority is granted to `FRANCHISE_ADMIN`.

**Conditions**
- Settings changes must respect the existing setting-level validation and business rules.
- GST/finance configuration controlled by HQ follows the same authority boundary.
- Changes must not retroactively alter historical transactions; historical invoices/transactions retain their stored snapshots.
- Changes should remain audit-tracked where the existing settings workflow supports auditing.

**RBAC implication**
- Primary action: `settings:edit`.
- No `gst:edit` action is created here — GST configuration doesn't get a bespoke action just because the frontend is unavailable; where GST configuration lives on an independently-managed resource (e.g. tax rates, service master), the natural resource-specific action applies instead (candidates: `tax:edit`, `services:edit`), to be settled during RBAC-01 catalog design, not pre-decided in this entry.

**Basis**: fresh determination from the established Shifterz authorization architecture.

**Status**: LOCKED.

---

## D-13 — Reports / Export

**Who**
- `SUPER_ADMIN` — access to all reports and exports, including consolidated/cross-franchise reporting.
- `HQ_USER` — access to all reports and exports, including consolidated/cross-franchise reporting.
- `FRANCHISE_ADMIN` — applicable reports and exports for their own franchise.
- `BRANCH_MANAGER` — applicable operational reports for their own franchise.
- `BILLING_EXECUTIVE` — financial/billing reports and exports for their own franchise.
- `INVENTORY_EXECUTIVE` — inventory reports and exports for their own franchise.
- `RECEPTION`, `SERVICE_ADVISOR`, `TECHNICIAN`, `QUALITY_INSPECTOR` — no general report/export authority.

**Scope**
- `SUPER_ADMIN` / `HQ_USER`: global.
- Franchise-scoped roles: own franchise only.
- No franchise-scoped role receives consolidated cross-franchise reporting through ordinary report permissions.

**Conditions**
- Export authorization follows the same role eligibility as the corresponding report access.
- Report data must always be constrained by `resolveDataScope()`.
- Report access does not automatically grant access to the underlying operational module.
- Report/export operations remain audit-tracked.
- Existing report-specific restrictions remain applicable.

**Exceptions**
- `SUPER_ADMIN` and `HQ_USER` may access consolidated reports.
- `FRANCHISE_ADMIN` cannot obtain another franchise's financial or operational report data.
- Frontline operational roles do not gain team/aggregate reporting merely because they can access individual operational records.

**RBAC implication**
- Conceptual actions: `reports:view`, `reports:export`.
- Not frozen here — RBAC-01 will inspect the actual report routes and determine whether domain-specific actions are needed (candidates: `reports:financial:view`, `reports:financial:export`, `reports:inventory:view`, `reports:gst:view`, `reports:gst:export`), to avoid D-13 accidentally defining an unnecessarily broad permission model.

**Current-state note**: as of this lock, no report route enforces any role restriction — only `authenticate` + franchise scope (`ReportController.resolveScope`, deduplicated onto `resolveDataScope` during GST-11). This decision defines the target model; it is not enforced until RBAC-04 wires route-level checks in, consistent with the "no big-bang enforcement" sequencing already agreed. Also consistent with the GST-11 decision to keep GST reports at parity with the rest of the reports module (no GST-specific carve-out) — D-13 restricts all reports uniformly, GST included, once enforced.

**Basis**: fresh determination from the established Shifterz role model and the separation between report authorization and franchise data scope.

**Status**: LOCKED.

---

## D-14 — Attendance Edit

**Who**
- `SUPER_ADMIN` — may edit attendance records globally.
- `HQ_USER` — may edit attendance records globally.
- `FRANCHISE_ADMIN` — may edit attendance records within their own franchise.
- Other roles — cannot edit other employees' attendance records.

**Scope**
- `SUPER_ADMIN` / `HQ_USER`: global.
- `FRANCHISE_ADMIN`: own franchise only.
- Frontline employees retain only their existing self-service attendance operations where supported (e.g. their own check-in/check-out); that does not grant attendance-edit authority over other employees.

**Conditions**
- Attendance edits must remain subject to the existing attendance/business validation.
- Franchise-scoped edits must be constrained through the actor's normal data scope.
- An employee cannot use self-service attendance functionality to alter another employee's attendance.
- Attendance modifications must be audit-tracked, including the actor and the relevant change.

**Exceptions**
- `FRANCHISE_ADMIN` cannot edit attendance belonging to another franchise.
- Ordinary employees do not receive attendance-edit authority simply because they can view or manage their own attendance.

**RBAC implication**
- Primary action: `attendance:edit`.
- Self-service operations should remain separate from administrative editing if the actual routes distinguish them; the detailed action split is finalized during RBAC-01's route/catalog inventory.

**Basis**: fresh determination from the established Shifterz authorization architecture.

**Implementation gaps found during RBAC-01 inventory and closed immediately** (same class as D-11/D-15/D-17/D-18 — identity-integrity and tenant-isolation defects, independent of the RBAC action-catalog project):
- `checkIn`/`checkOut` (`attendance.service.ts`) previously trusted `employeeId` from the request body — any authenticated employee could check in/out as a different employee. **Fixed**: `AttendanceController.checkIn`/`checkOut` now always pass `{ employeeId: req.user?.id }`; the client-supplied `employeeId` is never read.
- `updateAttendance` had no role or franchise-scope check at all — any authenticated user could edit any attendance record, any employee, any franchise. **Fixed**: `AttendanceService.updateAttendance` now takes `actor` and enforces SUPER_ADMIN/HQ_USER (global), FRANCHISE_ADMIN (own franchise only, checked against the fetched record's `franchiseId`), every other role blocked outright — matching this decision's "who"/"scope" exactly. Final role/action enforcement beyond this tenant-isolation boundary remains RBAC-04's job.

Verified via `npm run build` (clean), `test-gst-calculation-engine.ts` (27/27), `test-action-permission-resolver.ts` (6/6), no migration created, and static trace confirming a franchise-scoped actor is blocked from both another franchise's attendance and HQ/global (`franchiseId: null`) attendance.

**Status**: LOCKED (identity-spoofing and tenant-isolation gaps closed).

---

## D-15 — Leave Approval

**Who**
- `SUPER_ADMIN` — may approve/reject leave requests globally.
- `HQ_USER` — may approve/reject leave requests globally.
- `FRANCHISE_ADMIN` — may approve/reject leave requests within their own franchise.
- Other roles — cannot approve or reject leave requests.

**Scope**
- `SUPER_ADMIN` / `HQ_USER`: global.
- `FRANCHISE_ADMIN`: own franchise only.
- No franchise-scoped role receives cross-franchise leave-approval authority.

**Conditions**
- Approval/rejection must operate on leave requests within the actor's permitted data scope.
- The approver must be an authorized management-level actor; submitting one's own leave request does not grant approval authority.
- Existing leave validation and workflow rules remain applicable.
- Approval/rejection should be audit-tracked with actor and resulting status/change.

**Exceptions**
- `FRANCHISE_ADMIN` cannot approve or reject leave belonging to another franchise.
- Ordinary employees cannot approve leave merely because they can access or submit leave requests.
- No `BRANCH_MANAGER` approval authority.

**RBAC implication**
- Primary action: `leave:approve` (approve/reject treated as one authorization action unless a future business need requires splitting them).
- The action controls whether the actor has approval authority; `resolveDataScope()` controls which leave requests they may act upon.

**Implementation gaps found during this lock, handled differently by kind**:
- No role check exists at all on leave approve/reject (`leaveRouter` has no `requireRole()`; `updateLeaveStatus` only checked franchise match) — same category as D-13's report routes: a target-model gap, deferred to RBAC-04, not fixed now.
- No self-approval check existed — `updateLeaveStatus` never compared the requester (`leave.employeeId`) to the acting user, so any authenticated employee could approve their own leave request. This directly contradicts this decision's own explicit condition and is a workflow-integrity defect independent of the RBAC action-catalog project, same category as D-11's `approvedBy` fix. **Fixed**: `LeaveService.updateLeaveStatus` now takes the acting `userId` and throws if `leave.employeeId === userId`, before the franchise-scope check. Both controller call sites (`approveLeave`, `rejectLeave`) updated to pass `req.user?.id`. Verified via `npm run build` (clean), `test-gst-calculation-engine.ts` (27/27), `test-action-permission-resolver.ts` (6/6), no migration created.

**Basis**: fresh determination from the established Shifterz authorization architecture.

**Status**: LOCKED (self-approval gap closed; role-check gap deferred to RBAC-04).

---

## D-16 — Member Transfer Approval

**Who**
- `SUPER_ADMIN` — may approve/reject member/employee transfer requests globally.
- `HQ_USER` — may approve/reject transfer requests globally.
- `FRANCHISE_ADMIN` — cannot approve transfers.
- `BRANCH_MANAGER` — cannot approve transfers.
- Other operational roles — cannot approve transfers.

**Scope**
- `SUPER_ADMIN`: global.
- `HQ_USER`: global.
- Transfer approval is an HQ-level control, not a franchise-admin control.

**Conditions**
- The transfer request must be a valid pending transfer.
- Approval/rejection must be performed through the transfer workflow rather than by directly mutating employee/franchise assignment fields.
- The resulting transfer must respect the target franchise and employee validity rules.
- Approval/rejection must be audit-tracked.
- The approval authority does not automatically grant permission to create, edit, or delete transfer requests.

**Exceptions**
- `FRANCHISE_ADMIN` may participate in the operational process where separately permitted, but does not receive final approval authority.
- Cross-franchise transfer approval remains restricted to `SUPER_ADMIN` / `HQ_USER`.

**RBAC implication**
- Primary action: `members:transfer:approve` (approval/rejection kept under one authorization action; the endpoint/status determines which).
- D-16B (initiation / editing / soft-delete of transfer requests) remains explicitly parked — not decided by D-16, to avoid accidentally granting request-management authority while deciding approval authority.

**Sanity check — already correctly implemented**: unlike D-13/D-15, `transfer.service.ts` already enforces this exact rule today — both `approveTransfer` and `rejectTransfer` throw 403 unless `userRole === "SUPER_ADMIN" || userRole === "HQ_USER"`. No gap, no fix needed. Observation for whenever D-16B is decided (not acted on now, per its parked status): `create`/`update`/`delete` on transfer requests currently have no role restriction at all.

**Basis**: fresh determination from the established Shifterz authorization architecture.

**Status**: LOCKED.

---

## D-16B — Member Transfer Initiation/Edit/Soft-Delete

**Status**: PARKED — explicitly not decided as part of D-16. To be addressed separately.

---

## D-17 — Workflow Stage Administration

**Who**
- `SUPER_ADMIN` — may create, edit, activate/deactivate, and otherwise administer workflow-stage configuration globally.
- `HQ_USER` — may administer workflow-stage configuration globally.
- `FRANCHISE_ADMIN` — may administer workflow-stage configuration within their own franchise.
- `BRANCH_MANAGER` — cannot administer workflow-stage configuration.
- Other operational roles — may use workflow stages according to their operational permissions, but cannot administer the stage configuration.

**Scope**
- A workflow-stage configuration with no franchise association (`franchiseId = null`) is global/HQ-controlled.
- `SUPER_ADMIN` / `HQ_USER`: global workflow-stage administration.
- `FRANCHISE_ADMIN`: only franchise-scoped workflow-stage configuration belonging to their own franchise.
- A `FRANCHISE_ADMIN` cannot create or modify a global/null-franchise workflow stage.

**Conditions**
- Global workflow configuration remains an HQ-level responsibility.
- Franchise-specific configuration must remain inside the actor's normal franchise data scope.
- Administration of workflow configuration does not grant authority to bypass the actual operational workflow or transition rules.
- Existing stage lifecycle/validation rules remain applicable.
- Changes to workflow configuration should be audit-tracked.

**Exceptions**
- `BRANCH_MANAGER` does not receive administrative authority merely because they operate within a franchise.
- Operational users may execute workflow actions where separately authorized; D-17 concerns administration of the workflow-stage configuration, not ordinary workflow execution.

**RBAC implication**
- Primary conceptual action: `workflow:stages:manage`. Scope (global vs. franchise) is enforced by the data-scope layer, not encoded as separate actions (`...manage:global` / `...manage:franchise`) — the action determines capability, `resolveDataScope()` determines which configuration records.

**Implementation gap found and closed during this lock**: `updateStage`/`deleteStage` (`workflow-stage.service.ts`) had **no franchise-scope check at all** — any authenticated user, any role, any franchise, could update or soft-delete any workflow stage, including other franchises' stages and HQ's global (null-`franchiseId`) ones. `req.user` was available in the controller but never passed through. This is a Phase 1A tenant-isolation defect, independent of which role should be allowed to administer stages (that's RBAC-04's job, not fixed here). **Fixed**: both methods now take `actor` and call `assertWithinScope(resolveDataScope(actor), existing.franchiseId, ...)` before proceeding — a franchise-scoped actor now correctly gets "not found" on another franchise's or a global stage, matching this decision's scope rule. `createStage`'s existing (over-permissive: any non-HQ role with a `franchiseId`, not just `FRANCHISE_ADMIN`) role logic was left untouched — that's a role-eligibility question, deferred to RBAC-04. Verified via `npm run build` (clean), `test-gst-calculation-engine.ts` (27/27), `test-action-permission-resolver.ts` (6/6), no migration created.

**Basis**: fresh determination from the established Shifterz authorization architecture.

**Status**: LOCKED (tenant-isolation gap closed; role-eligibility gap on `createStage` deferred to RBAC-04).

---

## D-18 — QC Template Administration

**Who**
- `SUPER_ADMIN` — may administer QC templates globally.
- `HQ_USER` — may administer QC templates globally.
- `FRANCHISE_ADMIN` — may administer QC templates within their own franchise.
- `QUALITY_INSPECTOR` — may view/use QC templates, but cannot administer them.
- `BRANCH_MANAGER` — cannot administer QC templates.
- Other operational roles — cannot administer QC template configuration.

**Scope**
- `SUPER_ADMIN` / `HQ_USER`: global.
- `FRANCHISE_ADMIN`: own franchise only.
- A global template (`franchiseId = null`) is HQ-controlled and cannot be modified by a `FRANCHISE_ADMIN`.

**Conditions**
- Template administration means creating, editing, activating/deactivating, and deleting/retiring templates.
- QC execution/use remains separate from template administration.
- Default/system QC templates marked `isDefault` must not be deleted.
- Franchise-specific template changes must remain within the actor's normal franchise scope.
- Template configuration changes should be audit-tracked.

**Exceptions**
- `QUALITY_INSPECTOR` can use applicable templates during QC but does not gain configuration authority.
- `FRANCHISE_ADMIN` cannot administer global/default templates.
- Default templates cannot be removed merely because the actor has template-management authority.

**RBAC implication**
- Primary action: `qc:templates:manage`. Template use/execution stays a separate capability from administration; precise view/use action names finalized during RBAC-01 after the actual QC routes are inventoried. As with D-17, action authorization and franchise scope remain separate.

**Implementation gap found and closed during this lock**: `updateChecklistTemplateItem`/`deleteChecklistTemplateItem` (`qc.service.ts`, operating on `QCChecklistTemplate`) had **no franchise-scope check at all** — the identical defect to D-17's workflow-stage service, same code shape, same missing check. `req.user` was available in `qc.controller.ts` but never passed through to these two methods (`createChecklistTemplateItem` already received it). **Fixed**: both methods now take `user?: ActingUser` and call `assertWithinScope(resolveDataScope(user), existing.franchiseId, ...)` before proceeding. `createChecklistTemplateItem`'s existing role logic (any non-HQ role with a `franchiseId`, not just `FRANCHISE_ADMIN`, may create a franchise-scoped item) was left untouched — role-eligibility, deferred to RBAC-04. Verified via `npm run build` (clean), `test-gst-calculation-engine.ts` (27/27), `test-action-permission-resolver.ts` (6/6), no migration created.

**Basis**: fresh determination from the established Shifterz authorization architecture.

**Status**: LOCKED (tenant-isolation gap closed; role-eligibility gap on `createChecklistTemplateItem` deferred to RBAC-04).

---

## D-19 — Cross-Franchise Vehicle History

Intentionally different from the financial/employee/report scope rules elsewhere in this register.

**Who**

All operational roles may read vehicle history across franchises: `SUPER_ADMIN`, `HQ_USER`, `FRANCHISE_ADMIN`, `BRANCH_MANAGER`, `BILLING_EXECUTIVE`, `INVENTORY_EXECUTIVE`, `RECEPTION`, `SERVICE_ADVISOR`, `TECHNICIAN`, `QUALITY_INSPECTOR`.

**Scope**
- Cross-franchise read is explicitly allowed for vehicle history.
- A user does not need to belong to the vehicle's franchise merely to retrieve its service/history records.
- This is an intentional exception to the normal franchise data-scope model.

**Conditions**
- Cross-franchise vehicle history access is limited to vehicle/service-history information needed for operational continuity.
- It does not automatically expose: customer financial information, employee records, franchise financial/reporting data, inventory, unrelated customer records, administrative configuration.
- The vehicle should be identified through an appropriate vehicle identifier (registration/vehicle ID), not turned into unrestricted cross-franchise database access.

**Exceptions**
- Read-only. Does not grant cross-franchise create/update/delete authority over jobs, invoices, payments, customers, employees, inventory, etc.
- Franchise-specific records remain subject to their own authorization rules when accessed outside the vehicle-history context.

**RBAC implication**
- Primary action: `vehicles:history:view` — deliberately not `vehicles:view`, since ordinary vehicle access and this deliberate cross-franchise historical lookup are materially different authorization semantics. Carries an explicit cross-franchise scope exception in the catalog metadata rather than relying on `resolveDataScope()` to grant broad access.

**Sanity check — already correctly implemented, no gap**: `CustomerService.getVehicleServiceHistory` (`customer.service.ts`) intentionally queries `Job`/`Invoice`/`Warranty` with no franchise filter (the deliberate cross-franchise read), is reachable by any authenticated role with no role restriction (matching this decision's "who" list exactly — every listed role, no exclusions), and the returned shape is already narrow: `serviceDate`, `jobCardNumber`, `servicesPerformed`, `assignedEmployee`, `invoiceNumber`, `paymentStatus` (status only, not amounts) — no customer name/phone/GSTIN, no invoice amounts, no other-franchise financial data. Matches the stated exposure boundary as written.

**Basis**: fresh determination; deliberately an exception to the franchise-isolation default rather than an oversight.

**Status**: LOCKED.

---

## D-20 — Scheduler / System Credential Architecture

Not human RBAC — this is system-to-system authentication architecture. The proposal originally offered for "D-20 — Scheduler Endpoints" (SERVICE_ADVISOR/RECEPTION appointment-scheduling permissions) was a misidentification of the topic and was not recorded; confirmed via code that "scheduler" in this codebase refers only to cron-triggered internal endpoints, not a human appointment feature.

**Who**
- External cron/scheduler services.
- Internal background-job infrastructure, if introduced later.
- Other explicitly authorized Shifterz system-to-system callers.
- Human users must not be used as the authentication identity for automated scheduler calls.

**Scope**
- The credential is valid only for explicitly designated internal/system endpoints, currently including `POST /api/callbacks/reminders/dispatch` and the workshop periodic/background endpoint intended to be invoked by an external scheduler.
- A scheduler credential must not provide: normal user authentication, access to arbitrary API routes, franchise-wide/global human permissions, employee impersonation, or unrestricted database access.
- Each system endpoint must explicitly opt into system authentication.

**Conditions**
- Use a dedicated machine credential rather than a human JWT.
- Keep the credential out of request bodies and source control.
- Validate the credential before executing the scheduled operation.
- Use constant-time credential comparison where applicable.
- Support credential rotation/revocation without requiring a human login.
- Produce audit information identifying the system/scheduler caller, not a fabricated human employee.
- Keep the existing human `authenticate` middleware semantics unchanged for human-facing routes.
- Fail closed when the scheduler credential is missing or invalid.
- Establish one canonical system-authentication mechanism rather than separate ad-hoc secrets per cron endpoint.

**Exceptions**
- A normal employee JWT must not be required merely because an endpoint happens to be triggered by cron.
- A scheduler credential must not be accepted by ordinary human-facing endpoints.
- The scheduler mechanism must not bypass existing business/workflow validation inside the target service.
- IP allowlisting may be an additional defense where infrastructure supports stable source IPs, but must not be the sole authentication mechanism.
- The exact credential transport/rotation implementation is finalized during implementation; this decision establishes the authorization architecture, not a premature choice of one secret format.

**RBAC implication**
- This is system authorization, not ordinary role/action RBAC. Introduces a distinct system identity concept (e.g. `SYSTEM_SCHEDULER`) with explicit endpoint-level authorization (e.g. `scheduler:callbacks:dispatch`, `scheduler:workshop:run`) — never added as permissions to human roles.
- Two distinct authorization paths: Human JWT → normal user/session + RBAC + data scope. System credential → authenticated scheduler identity + explicitly allowed system endpoint.

**Sanity check**: confirmed via code — `POST /api/callbacks/reminders/dispatch` (commented "called by cron") and the workshop periodic endpoint (commented "intended to be hit periodically by an external scheduler") both currently sit behind the same human `authenticate` middleware as every other route. No system/service-account credential mechanism exists anywhere in the codebase (`CRON_SECRET`, API-key auth, etc. — none found). This confirms the gap the decision describes; no narrow fix applies here the way it did for D-11/D-15/D-17/D-18 — this decision deliberately defers implementation.

**Basis**: fresh determination; captures a real, previously-unaddressed architectural gap, not a paraphrase of original wording.

**Status**: LOCKED (architecture decision only — implementation not started, deliberately deferred per this decision's own text).

---

## D-21 — Executive / Reception Dashboards

**Who**

Executive / management dashboard access:
- `SUPER_ADMIN` — all dashboards, global.
- `HQ_USER` — all dashboards, global.
- `FRANCHISE_ADMIN` — franchise dashboard for their own franchise.
- `BRANCH_MANAGER` — operational dashboard for their own franchise.

Reception / operational dashboard access:
- `RECEPTION` — reception/front-desk operational dashboard for their permitted franchise.
- `SERVICE_ADVISOR` — service/advisor operational dashboard for their permitted franchise.
- `TECHNICIAN` — technician/workshop dashboard limited to relevant assigned/workshop information.
- `QUALITY_INSPECTOR` — QC dashboard limited to relevant QC information.

Specialized roles:
- `BILLING_EXECUTIVE` — billing/financial operational dashboard for their own franchise.
- `INVENTORY_EXECUTIVE` — inventory dashboard for their own franchise.

**Scope**
- `SUPER_ADMIN` / `HQ_USER`: global dashboard data, including consolidated franchise-level information where the dashboard is designed for HQ.
- `FRANCHISE_ADMIN` / `BRANCH_MANAGER`: own-franchise dashboard data only.
- Operational roles: only the dashboard data required for their operational responsibility.
- Dashboard access must not automatically grant access to the underlying module's full records.
- Normal `resolveDataScope()` rules remain the default for franchise-scoped dashboards.
- D-19's cross-franchise vehicle-history exception does not make dashboards cross-franchise.

**Conditions**

Dashboard data should be: read-only unless a specific dashboard action is separately authorized; derived from authorized underlying data; consistent with the user's franchise scope and role; restricted to the minimum information necessary for that dashboard.

Executive dashboard: operational KPIs, revenue/collection summaries where authorized, job/workshop status, QC/completion status, franchise comparisons for HQ users.

Reception dashboard: today's appointments/callbacks, vehicle/job status needed for customer handling, pending operational actions, delivery/outpass status where appropriate.

A dashboard permission must not become an indirect way to retrieve unrestricted customer, employee, financial, inventory, or administrative records.

**Exceptions**
- `BRANCH_MANAGER` receives operational dashboard visibility but does not inherit HQ/consolidated executive authority.
- `RECEPTION`, `SERVICE_ADVISOR`, `TECHNICIAN`, and `QUALITY_INSPECTOR` do not receive executive/consolidated financial dashboards merely because they have dashboard access.
- `BILLING_EXECUTIVE` and `INVENTORY_EXECUTIVE` receive their respective domain dashboards, not unrestricted executive reporting.
- Dashboard visibility does not grant the ability to modify the records represented by dashboard metrics.
- Any actionable dashboard control must use its own underlying authorization rule; `dashboard:view` cannot implicitly grant the corresponding write action.

**RBAC implication**

Not one broad `dashboard:view` for everyone. RBAC-01 inventories the actual dashboard endpoints/widgets and derives the smallest useful action set; likely candidates: `dashboards:executive:view`, `dashboards:reception:view`, `dashboards:service:view`, `dashboards:workshop:view`, `dashboards:qc:view`, `dashboards:billing:view`, `dashboards:inventory:view`. Final names determined from the actual route/controller inventory during RBAC-01, same deferral pattern as D-13's report granularity.

Important sequencing: this decision defines who may see which dashboard class. It does not authorize the dashboard to bypass the underlying data-scope or module authorization.

**Sanity check — significant gap, larger than a narrow fix, deferred to RBAC-04**: the current implementation is a single, undifferentiated dashboard endpoint (`GET /api/dashboard`, plus `GET /employee/:id`) gated only by `authenticate` + tenant scope — no role gating at all. It returns CRM, workshop, and other metrics together to any authenticated employee, franchise-scoped only; there is no split into the seven dashboard classes this decision describes anywhere in the code. Unlike D-11/D-15/D-17/D-18, this isn't a one-line scope-check fix — splitting one monolithic endpoint into role-differentiated dashboards is substantial build work. Not attempted now; explicitly RBAC-04 (or a dedicated follow-up) territory, consistent with this decision's own deferral of the action catalog to RBAC-01.

**Basis**: fresh determination from the established Shifterz role model.

**Status**: LOCKED (architecture/target model only — the underlying dashboard-splitting work is a substantial, separate build, not started here).

---

**D-08 through D-21: register complete.** All 14 decisions locked. Proceed to RBAC-01: action catalog derived strictly from this file.
