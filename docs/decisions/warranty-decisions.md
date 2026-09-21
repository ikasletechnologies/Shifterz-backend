# WTY-01B — Warranty Policy Decisions

Locked business-policy decisions for the Warranty Management module, following the WTY-01 audit and WTY-01A safe remediation. These decisions govern WTY-01C's implementation scope. Nothing in this document has been implemented yet — this is a decision record only, mirroring the format and discipline of `docs/decisions/rbac-decisions.md`.

---

## D-W1 — Service Master Default Warranty

**Decision**: The Service Master's standard warranty **shall automatically become the invoice's warranty** whenever billing does not explicitly override it.

**Rationale**: Closes the gap identified in WTY-01 where an invoice with no supplied `warranty` value silently falls through to the hardcoded `"3 Months / 5,000 KM"` fallback in `generateFromInvoice`, with no traceable connection to the actual service performed. EPB §13.5 already establishes "Each service shall have: Standard Price, Standard Warranty" — this decision makes the backend honor that standard warranty as the default, not just the price.

**Scope**: Applies at invoice creation/update time in `billing.service.ts` (or wherever the invoice's warranty value is finalized) — when no explicit warranty override is present for a line item/invoice, look up the corresponding `Service.warranty` (or equivalent Service Master field) and use it instead of leaving the field empty or relying on `generateFromInvoice`'s own fallback.

**Not decided here**: The exact mechanism (looked up per line item vs. per invoice; whether `Service` model already has a warranty field or one needs to be confirmed/added) is an implementation detail for WTY-01C, not re-opened as a policy question.

**Status**: LOCKED.

---

## D-W2 — Manual Warranty Creation Requires a Qualifying Invoice

**Decision**: `POST /api/warranties` (manual warranty creation via `WarrantyService.createWarranty`) **shall require a real, completed, qualifying invoice** going forward. Manual creation independent of any invoice is no longer permitted.

**Rationale**: EPB §20's business rule is explicit: "Warranty shall be generated from completed invoices." WTY-01 found `createWarranty` had no invoice-linkage requirement at all — any authenticated user could manufacture a warranty for an arbitrary customer/vehicle/service with no qualifying document behind it. This decision closes that gap rather than preserving it as a parallel, unconstrained creation path.

**Scope**: `createWarranty` must validate that `invoiceId` is present and refers to a real invoice satisfying the same "qualifying" bar `generateFromInvoice` already applies (type = Invoice, not a Quotation/Estimate; not deleted). Whether it must be the *exact same* qualification logic as the automatic path, or a documented subset, is an implementation detail for WTY-01C.

**Explicitly superseded**: WTY-01A's item 10 ("manual warranty creation semantics are a BUSINESS DECISION... do not remove or redesign manual creation") — this decision now answers that question. WTY-01C may proceed to implement it.

**Status**: LOCKED.

---

## D-W3 — "Management Approval" Is Satisfied by Billing-Time Authorization

**Decision**: EPB §13.7's "Warranty may differ based on: ... Management Approval" **does not require a separate approval workflow or status**. Authorization by whoever is permitted to finalize the invoice at billing time is sufficient to satisfy this requirement.

**Rationale**: The current implementation already treats warranty as an open field modifiable by whoever can edit the invoice, consistent with §13.5's "authorized users may modify... Warranty Period. All changes shall be recorded in the Audit Trail." No dedicated approval-state machine is introduced.

**Scope**: No new status, no new approval endpoint, no new entity. The existing invoice-edit authorization (whatever governs who can create/update invoices in Billing) is the entirety of "Management Approval" for warranty purposes. Audit trail coverage of warranty-affecting invoice edits (already required by §13.5 regardless of this decision) satisfies the traceability expectation.

**Status**: LOCKED.

---

## D-W4 — Warranty Claims Remain a JSON Blob

**Decision**: Warranty Claims **shall remain the current JSON-string history field** on the `Warranty` row. No normalized `WarrantyClaim` model is introduced at this time.

**Rationale**: Minimal, non-breaking choice — avoids a schema change and a larger WTY-01C scope. The existing `addClaim`/`claims` mechanism (append-only JSON array, `claimedBy` now actor-derived per WTY-01A) is retained as-is.

**Scope**: WTY-01C should not build claim-status/approval/rejection infrastructure. If claim query-ability or claim-status workflows become a real product need later, that is a *new* decision to revisit, not something to infer from this one.

**Status**: LOCKED.

---

## D-W5 — Warranty Role Matrix: HQ-Only Authority (mirrors Inventory)

**Decision**: Warranty **create/modify/delete/claim-approval** authority is restricted to **SUPER_ADMIN and HQ_USER only** — the same narrow pattern already locked for Inventory dispatch/approval (D-16-style) and Inventory Product Request approval (INV-05). All other operational roles (FRANCHISE_ADMIN, BRANCH_MANAGER, BILLING_EXECUTIVE, INVENTORY_EXECUTIVE, RECEPTION_EXECUTIVE, SERVICE_ADVISOR, TECHNICIAN, QUALITY_INSPECTOR) get **franchise-scoped read access** and **the ability to request/create** a warranty (via the now invoice-gated manual path, or automatically via the billing flow) but **not** to modify, delete, or resolve a claim.

**Rationale**: Explicit lock rather than inferring authority from the pre-WTY-01A state (which had none at all). Matches the narrowest existing precedent in this exact adjacent domain (Inventory) rather than the broader `MANAGEMENT_ROLES` pattern used for job-card material consumption — warranty issuance/modification is a financially/legally significant record (analogous to invoice cancellation, D-10, also HQ-tier), not an operational workshop approval.

**Scope**: Applies to `updateWarranty`, `deleteWarranty`, `addClaim` (resolving/actioning a claim). `getAllWarranties`/`getWarrantyById` (read) and `createWarranty`/`generateFromInvoice`/the customer-path creation remain reachable by any authenticated, franchise-scoped actor (read and create are not restricted by this decision — only modify/delete/claim-resolution are).

**Explicit non-invention constraint carried forward**: No new RBAC action is created by this decision. Authority is enforced the same way Inventory's dispatch/approve endpoints do it today — an inline role check (`SUPER_ADMIN`/`HQ_USER` only) at the controller or service layer — not a `requireAction()` grant, since no locked RBAC-01 action catalog entry exists for warranty and inventing one is out of scope here (matches WTY-01A's explicit instruction not to invent a warranty RBAC action, and this decision does not reopen that).

**Status**: LOCKED.

---

## Deferred (explicitly kept separate, not part of this decision set)

- **Warranty report consolidation** into the canonical `report.service.ts` (currently a separate `warranty_report` implementation inside `customer.service.ts`) — deferred to its own future phase.
- **Replacing the hardcoded `"3 Months / 5,000 KM"` fallback** in `generateFromInvoice` — partially superseded in *effect* by D-W1 (a real Service Master default should mean this fallback is rarely reached), but the fallback string itself and what should happen when *neither* an explicit warranty *nor* a Service Master default exists is not decided here. Left for the same future phase as the report consolidation, per explicit instruction.

---

**Next**: WTY-01C — implement D-W1 through D-W5 as a focused implementation phase, without revisiting the policy questions this document already answers.
