import { QcRepository } from './qc.repository.js';
import type { FrozenChecklistItem } from './qc.repository.js';
import type { AssignQcDTO, QcChecklistDTO, QcDecisionDTO, CreateChecklistTemplateItemDTO, UpdateChecklistTemplateItemDTO } from './qc.validation.js';
import { QC_PHOTO_CATEGORIES } from './qc.validation.js';
import { db } from '../../lib/db.js';
import { NotFoundError } from '../../shared/errors/NotFoundError.js';
import { ForbiddenError } from '../../shared/errors/ForbiddenError.js';
import { ValidationError } from '../../shared/errors/ValidationError.js';
import { resolveDataScope, assertWithinScope } from '../../shared/scope/dataScope.js';
import {
  notifyQcAssigned,
  notifyQcFailed,
  notifyQcPassed,
} from '../../shared/services/notification.service.js';

const HQ_ROLES = ['SUPER_ADMIN', 'HQ_USER'];
const MANAGEMENT_ROLES = ['SUPER_ADMIN', 'HQ_USER', 'FRANCHISE_ADMIN', 'BRANCH_MANAGER'];
const QC_ROLES = ['QUALITY_INSPECTOR', 'QUALITY_INSPECTION', 'QC_INSPECTOR', 'QC', 'QUALITY_ASSURANCE'];
const normalizeRole = (role?: string) => (role || '').toUpperCase().replace(/[\s_]+/g, '_');

// Phase 4B-2A — the only Job statuses a QC attempt may legitimately be
// started against. Mirrors the literal strings job-card.service.ts's own
// completion gate uses (it treats these as the valid targets/sources for
// entering or re-entering QC) — duplicated rather than imported, matching
// this codebase's existing pattern of not cross-importing between the qc and
// job-card modules for a handful of literals (see job-card.service.ts's own
// comment on QC_ROLES for the same rationale).
const QC_STARTABLE_JOB_STATUSES = ['Waiting for Quality Check', 'Rework Required'];

type ActingUser = { id?: string; name?: string; role?: string; franchiseId?: string | null; hqControlled?: boolean };

export class QcService {
  constructor(private readonly repository: QcRepository = new QcRepository()) {}

  // ─── Access Control (12.11.2) ──────────────────────────────────────────────

  private checkQcAccess(user?: ActingUser) {
    const role = normalizeRole(user?.role);
    if (!QC_ROLES.includes(role) && !MANAGEMENT_ROLES.includes(role)) {
      throw new ForbiddenError("Only an authorized Quality Inspector or management may perform this action.");
    }
  }

  // Phase 4A — Tenant Isolation. Every QC operation resolves the acting
  // user's data scope and applies it to the job lookup itself (not as an
  // after-the-fact check), so a job outside the caller's franchise is
  // indistinguishable from a job that doesn't exist.
  private async getJobOrThrow(jobId: string, user?: ActingUser) {
    const scope = resolveDataScope(user);
    const job = await this.repository.findJobById(jobId, scope);
    if (!job) throw new NotFoundError("Job card not found");
    return job;
  }

  // Phase 4B-2A — QC lifecycle integrity. Neither explicit assignment nor
  // lazy-start may create a QCInspection attempt against a job that isn't
  // legitimately entering (or re-entering, after rework) the QC queue —
  // otherwise a stray Pending attempt can be spawned against an already
  // Ready-For-Billing/delivered/cancelled job.
  private assertStartableStatus(job: { status: string }) {
    if (!QC_STARTABLE_JOB_STATUSES.includes(job.status)) {
      throw new ValidationError(
        `QC inspection cannot be started for a job in "${job.status}" status. Job must be in "Waiting for Quality Check" or "Rework Required".`
      );
    }
  }

  // Phase 4B-2C — mandatory-checklist completeness, checked only at the
  // decision boundary. `submitChecklist` is a genuinely incremental save
  // (the checklist dialog reseeds from whatever was last saved and can be
  // resubmitted any number of times before a decision), so gating
  // completeness there would block an inspector from saving legitimate
  // partial progress. This check is narrowly scoped to checklist
  // completeness only — it does not add any other Pass/Fail precondition
  // (photos, failure reason, rework evidence, etc. remain untouched, out of
  // this phase's scope). A checklist with zero mandatory items (the default
  // for every pre-existing row) short-circuits immediately.
  //
  // Phase 4B-2D-A — no longer re-resolves QCChecklistTemplate at all.
  // `mandatoryIds` now comes from `checklistDefinition`, frozen once at
  // Start (see QcRepository.buildFrozenChecklist) — a template change made
  // after Start (adding a new mandatory item, or flipping an existing
  // item's mandatory flag either way) has zero effect on an already-open
  // inspection's completeness requirement. This is the fix for the
  // Phase 4B-2D discovery's HIGH-severity finding: a live-resolved mandatory
  // check could previously demand an item the inspector was never shown.
  // Structurally this is otherwise the same shape the pre-4B-2D-A version
  // used against a live template query: mandatory ids come from one source
  // (there: QCChecklistTemplate; here: the frozen definition), cross-
  // referenced against `checklist` (Phase 4B-2C, submitted-items-only) to
  // find anything still missing or explicitly Unanswered.
  // Phase 4B-3-B — QC Inspector Ownership. Business rule: one Pending
  // attempt has exactly one owning inspector (QCInspection.inspectorId, set
  // once at creation by either getOrCreateOpenInspection or
  // createAssignedInspection — both already preserve an existing row's
  // inspectorId rather than overwriting it, so this field is effectively
  // write-once for the lifetime of a Pending attempt; there is no
  // reassignment code path). Any other authenticated QC-capable user may
  // still READ the inspection (tenant-scoped read access is unchanged —
  // listInspections/getOrCreateOpenInspection's read side are unaffected),
  // but may not submit its checklist, upload photos to it, or record its
  // decision. A null/undefined inspectorId (should not occur via either
  // creation path, both of which always stamp a value) is treated as
  // "no owner recorded" and blocks no one, since there is nothing to
  // enforce against. Management roles get NO automatic bypass in this
  // phase (explicit business decision) — a future takeover mechanism, if
  // ever needed, is a separate, not-yet-designed action.
  private assertInspectionOwner(inspection: { inspectorId?: string | null }, user?: ActingUser) {
    if (inspection.inspectorId && inspection.inspectorId !== user?.id) {
      throw new ForbiddenError("You are not the assigned inspector for this QC inspection.");
    }
  }

  private assertChecklistComplete(inspection: { checklist: unknown; checklistDefinition: unknown }) {
    const definition = Array.isArray(inspection.checklistDefinition) ? (inspection.checklistDefinition as FrozenChecklistItem[]) : [];
    const mandatoryIds = definition.filter((t) => t.mandatory).map((t) => t.id);
    if (mandatoryIds.length === 0) return;

    const checklist = Array.isArray(inspection.checklist) ? (inspection.checklist as { id: string; result?: string }[]) : [];
    const byId = new Map(checklist.map((item) => [item.id, item]));

    const incompleteIds = mandatoryIds.filter((id) => {
      const entry = byId.get(id);
      return !entry || entry.result === 'Unanswered' || entry.result === undefined;
    });
    if (incompleteIds.length > 0) {
      throw new ValidationError(
        `Checklist is incomplete: ${incompleteIds.length} mandatory item(s) have not been answered.`
      );
    }
  }

  // ─── QC Queue ─────────────────────────────────────────────────────────────

  async getQueue(franchiseId: string | null) {
    return this.repository.getQueue(franchiseId);
  }

  // ─── QC Assignment (12.3) ──────────────────────────────────────────────────

  async assignInspector(jobId: string, data: AssignQcDTO, user?: ActingUser) {
    const role = normalizeRole(user?.role);
    if (!MANAGEMENT_ROLES.includes(role)) {
      throw new ForbiddenError("Only management may assign a Quality Inspector.");
    }

    const job = await this.getJobOrThrow(jobId, user);
    this.assertStartableStatus(job);
    const scope = resolveDataScope(user);

    const inspector = await db.employee.findFirst({ where: { id: data.inspectorId, isDeleted: false } });
    if (!inspector) throw new NotFoundError("Quality Inspector not found");
    // Tenant isolation: a franchise-scoped manager may not deputize an
    // inspector belonging to a different franchise onto their job.
    assertWithinScope(scope, inspector.franchiseId, "Quality Inspector not found");
    if (inspector.status !== 'Active') {
      throw new ValidationError("Selected Quality Inspector is not an active employee.");
    }
    const inspectorRole = normalizeRole(inspector.role);
    if (!QC_ROLES.includes(inspectorRole) && !MANAGEMENT_ROLES.includes(inspectorRole)) {
      throw new ValidationError("Selected employee does not hold a Quality Inspector or management role.");
    }

    const inspection = await this.repository.createAssignedInspection(jobId, {
      inspectorId: inspector.id,
      inspectorName: inspector.name,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      priority: data.priority || null,
      assignRemarks: data.remarks || null,
    });
    if (!inspection) throw new NotFoundError("Job card not found");

    await this.repository.updateJob(jobId, {
      qcAttemptCount: inspection.attemptNumber,
      qcById: inspector.id,
      qcBy: inspector.name,
    });

    notifyQcAssigned({ jobId, vehicle: job.vehicle, inspectorId: inspector.id }).catch(console.error);

    return inspection;
  }

  // ─── Open Attempt (lazily created if assignment step was skipped) ─────────

  async getOrCreateOpenInspection(jobId: string, user?: ActingUser) {
    this.checkQcAccess(user);
    const job = await this.getJobOrThrow(jobId, user);
    this.assertStartableStatus(job);

    const inspection = await this.repository.getOrCreateOpenInspection(jobId, {
      inspectorId: user?.id || null,
      inspectorName: user?.name || null,
    });
    if (!inspection) throw new NotFoundError("Job card not found");

    // Keep Job.qcById/qcBy/qcAttemptCount in sync with whichever attempt is
    // now open, mirroring the pre-existing assignment-path behavior.
    await this.repository.updateJob(jobId, {
      qcAttemptCount: inspection.attemptNumber,
      qcById: inspection.inspectorId ?? user?.id ?? null,
      qcBy: inspection.inspectorName ?? user?.name ?? null,
    });

    return inspection;
  }

  // ─── QC Checklist (12.4) ───────────────────────────────────────────────────

  async submitChecklist(jobId: string, checklist: QcChecklistDTO['checklist'], user?: ActingUser) {
    this.checkQcAccess(user);
    await this.getJobOrThrow(jobId, user);

    // Phase 4B-2C — enforced here (not only in qc.validation.ts's Zod
    // schema) because this is the layer every caller actually goes through,
    // including direct service calls from tests that never pass through the
    // Express route/Zod middleware at all. The backend must be authoritative
    // regardless of entry point.
    const seenIds = new Set<string>();
    const duplicateIds = new Set<string>();
    for (const item of checklist) {
      if (seenIds.has(item.id)) duplicateIds.add(item.id);
      seenIds.add(item.id);
    }
    if (duplicateIds.size > 0) {
      throw new ValidationError(`Checklist contains duplicate item ID(s): ${[...duplicateIds].join(', ')}`);
    }

    // Phase 4B-2D-A — validate against the FROZEN definition captured at
    // Start (QcRepository.buildFrozenChecklist / checklistDefinition), never
    // against a fresh QCChecklistTemplate read. getOrCreateOpenInspection
    // both is the freeze point for a brand-new attempt and simply returns
    // the already-frozen row for an existing one, so either way
    // `inspection.checklistDefinition` below is this attempt's authoritative,
    // immutable definition — a template item added, deleted, renamed, or
    // re-mandatoried after Start has no bearing on it (this is the fix for
    // the Phase 4B-2D discovery's two HIGH findings: a live-resolved
    // template could previously introduce an unanswerable new mandatory
    // item, or hard-reject an entire submission over an item HQ had since
    // deleted).
    const inspection = await this.getOrCreateOpenInspection(jobId, user);

    // Phase 4B-3-B — ownership check happens right after the current
    // Pending attempt is resolved (existence/Pending/tenant-scope are all
    // already guaranteed by getOrCreateOpenInspection above), before any
    // checklist-content validation runs.
    this.assertInspectionOwner(inspection, user);

    const frozen = Array.isArray(inspection.checklistDefinition) ? (inspection.checklistDefinition as unknown as FrozenChecklistItem[]) : [];
    const frozenById = new Map(frozen.map((item) => [item.id, item]));

    const unknownIds = checklist.filter((item) => !frozenById.has(item.id)).map((item) => item.id);
    if (unknownIds.length > 0) {
      throw new ValidationError(`Checklist contains items not in the configured template: ${unknownIds.join(', ')}`);
    }

    const missingRemarks = checklist
      .filter((item) => item.result === 'Failed' && !(item.remark && item.remark.trim()))
      .map((item) => item.id);
    if (missingRemarks.length > 0) {
      throw new ValidationError(`A remark is required for failed checklist item(s): ${missingRemarks.join(', ')}`);
    }

    // Phase 4B-2C behavior, unchanged: `checklist` is replaced wholesale
    // with exactly what this call submits (not merged with whatever was
    // stored before) — enrichment now comes from the frozen definition
    // instead of a live template lookup, but the replace-not-merge contract
    // itself is exactly what the pre-existing Phase 4B-1 test suite asserts
    // (checklist's stored array length reflects what was submitted).
    const enrichedChecklist = checklist.map((item) => {
      const meta = frozenById.get(item.id);
      return { ...item, label: meta?.label, category: meta?.category };
    });

    // Phase 4B-2A — defense-in-depth: updateInspection only writes if the
    // attempt is still Pending. In the normal case this always succeeds
    // (getOrCreateOpenInspection above only ever hands back a Pending
    // attempt); null here means a concurrent decide() finalized this exact
    // attempt in the narrow window between that call and this one.
    const updated = await this.repository.updateInspection(inspection.id, { checklist: enrichedChecklist });
    if (!updated) {
      throw new ValidationError(`QC attempt #${inspection.attemptNumber} was finalized before the checklist could be saved. Start a new attempt.`);
    }
    return updated;
  }

  // ─── Photo Verification (12.5) ─────────────────────────────────────────────

  async uploadPhotos(jobId: string, category: string, urls: string[], user?: ActingUser) {
    this.checkQcAccess(user);
    const job = await this.getJobOrThrow(jobId, user);

    if (!(QC_PHOTO_CATEGORIES as readonly string[]).includes(category)) {
      throw new ValidationError(`Invalid QC photo category "${category}". Must be one of: ${QC_PHOTO_CATEGORIES.join(', ')}.`);
    }

    const inspection = await this.getOrCreateOpenInspection(jobId, user);

    // Phase 4B-3-B — same ownership rule as submitChecklist, checked after
    // the Pending attempt is resolved and before any photo rows are written.
    this.assertInspectionOwner(inspection, user);

    return this.repository.createQcPhotos(jobId, inspection.id, category, urls, {
      id: user?.id,
      name: user?.name,
      franchiseId: user?.franchiseId || job.franchiseId,
    });
  }

  // ─── QC Decision (12.6) ────────────────────────────────────────────────────

  async decide(jobId: string, data: QcDecisionDTO, user?: ActingUser) {
    this.checkQcAccess(user);
    const job = await this.getJobOrThrow(jobId, user);

    // Preliminary, NON-authoritative read: only used to give a clean error
    // when no inspection exists at all (nothing to race on in that case).
    // It must never be trusted for the Pending/idempotency decision itself —
    // see repository.recordDecision, which makes that transition atomic and
    // race-safe via a conditional UPDATE inside the transaction.
    const latest = await this.repository.findLatestInspection(jobId);
    if (!latest) {
      throw new ValidationError("No open QC inspection for this job. Submit a checklist before recording a decision.");
    }

    // Phase 4B-2C — only checked for an attempt still awaiting its decision;
    // a retry against an already-finalized attempt skips straight to
    // recordDecision's existing idempotent/conflict handling unchanged.
    //
    // Phase 4B-3-B — ownership is likewise only checked while the attempt is
    // still Pending: there is nothing left to "own" once it's finalized, and
    // a decide() call against an already-decided attempt (from anyone) must
    // keep falling through to recordDecision's existing idempotent/conflict
    // classification untouched, not a new ownership rejection. Checking
    // ownership here — before recordDecision's own conditional UPDATE even
    // runs — is what makes two concurrent decide() calls (owner vs.
    // non-owner) resolve as "non-owner rejected for lack of ownership"
    // rather than racing the DB update: inspectorId is write-once for a
    // Pending attempt's lifetime (see assertInspectionOwner), so this
    // pre-transaction read is safe to trust.
    if (latest.result === 'Pending') {
      this.assertInspectionOwner(latest, user);
      this.assertChecklistComplete(latest);
    }

    const outcome = await this.repository.recordDecision(jobId, latest.id, {
      result: data.result,
      reason: data.reason || null,
      remarks: data.remarks || null,
      reworkRequired: data.reworkRequired,
      performedBy: user?.id || 'SYSTEM',
    });

    if (outcome.outcome === 'conflict') {
      throw new ValidationError(
        `QC attempt #${outcome.inspection.attemptNumber} was already recorded as "${outcome.inspection.result}" and cannot be changed to "${data.result}".`
      );
    }

    // Only the caller whose UPDATE actually won the Pending -> terminal
    // transition fires the authoritative notification — an idempotent retry
    // (outcome === 'already-same') must not re-notify.
    if (outcome.outcome === 'applied') {
      if (data.result === 'Passed') {
        notifyQcPassed({
          franchiseId: job.franchiseId,
          jobId,
          vehicle: job.vehicle,
          customerName: job.customer,
        }).catch(console.error);
      } else {
        notifyQcFailed({
          jobId,
          vehicle: job.vehicle,
          technicianId: job.technicianId,
          reason: data.reason,
        }).catch(console.error);
      }
    }

    return outcome.job;
  }

  // ─── QC History (12.8) ─────────────────────────────────────────────────────

  async listInspections(jobId: string, user?: ActingUser) {
    await this.getJobOrThrow(jobId, user);
    return this.repository.listInspections(jobId);
  }

  // ─── Checklist Template (12.4, HQ-configurable) ────────────────────────────

  async getChecklistTemplate(franchiseId: string | null) {
    return this.repository.findChecklistTemplate(franchiseId);
  }

  // Phase 4B-2D-C — thin read used only so the controller can capture an
  // audit `oldValue` before update/delete. Deliberately does not enforce
  // scope itself (that already happens inside update/deleteChecklistTemplateItem
  // right after); this is a read for audit-record construction only, never
  // returned to the HTTP caller directly.
  async getChecklistTemplateItemById(id: string) {
    return this.repository.findChecklistTemplateItemById(id);
  }

  async createChecklistTemplateItem(data: CreateChecklistTemplateItemDTO, user?: ActingUser) {
    const isHq = HQ_ROLES.includes(normalizeRole(user?.role));
    if (!isHq) {
      if (!user?.franchiseId) {
        throw new ForbiddenError("Only HQ may create a global checklist item.");
      }
      data = { ...data, franchiseId: user.franchiseId };
    }
    // Phase 4B-2C — application-level duplicate guard: fast, friendly
    // rejection in the common (non-racing) case. Scoped to the exact same
    // franchiseId bucket being written to — a franchise item is still free
    // to share a label with a global item, since that's the pre-existing
    // accepted union behavior, not something this phase changes.
    const duplicate = await this.repository.findChecklistTemplateDuplicate(data.category, data.label, data.franchiseId ?? null);
    if (duplicate) {
      throw new ValidationError(`A checklist item with category "${data.category}" and label "${data.label}" already exists in this scope.`);
    }
    // Phase 4B-2C closure fix — the check above is TOCTOU-vulnerable under
    // concurrent requests (two callers can both pass it before either
    // commits). QCChecklistTemplate_scope_category_label_ci_key is the
    // actual concurrency backstop; a violation surfaces here as a P2002 and
    // is translated into the same domain error rather than leaking a raw
    // Prisma/Postgres error to the API consumer.
    try {
      return await this.repository.createChecklistTemplateItem(data);
    } catch (err) {
      if (QcRepository.isDuplicateChecklistTemplateError(err)) {
        throw new ValidationError(`A checklist item with category "${data.category}" and label "${data.label}" already exists in this scope.`);
      }
      throw err;
    }
  }

  // D-18 — tenant-isolation fix: these previously had no franchise-scope
  // check at all, so any authenticated user could modify or delete any QC
  // checklist template item, including other franchises' or HQ's global
  // (null franchiseId) ones — the same defect as D-17's workflow-stage
  // service. Role eligibility (who besides HQ/FRANCHISE_ADMIN may administer)
  // is deferred to RBAC-04, not decided here.
  async updateChecklistTemplateItem(id: string, data: UpdateChecklistTemplateItemDTO, user?: ActingUser) {
    const existing = await this.repository.findChecklistTemplateItemById(id);
    if (!existing) throw new NotFoundError("Checklist item not found");
    assertWithinScope(resolveDataScope(user), existing.franchiseId, "Checklist item not found");

    // Phase 4B-2C — only re-check when category/label are actually changing,
    // against the item's own (unchanged) scope; excludes itself from the
    // duplicate search.
    if (data.category !== undefined || data.label !== undefined) {
      const duplicate = await this.repository.findChecklistTemplateDuplicate(
        data.category ?? existing.category,
        data.label ?? existing.label,
        existing.franchiseId,
        id
      );
      if (duplicate) {
        throw new ValidationError(`A checklist item with category "${data.category ?? existing.category}" and label "${data.label ?? existing.label}" already exists in this scope.`);
      }
    }
    // Phase 4B-2C closure fix — same TOCTOU gap and same backstop as
    // createChecklistTemplateItem: a concurrent rename racing this one could
    // pass the pre-check above before either commits.
    try {
      return await this.repository.updateChecklistTemplateItem(id, data);
    } catch (err) {
      if (QcRepository.isDuplicateChecklistTemplateError(err)) {
        throw new ValidationError(`A checklist item with category "${data.category ?? existing.category}" and label "${data.label ?? existing.label}" already exists in this scope.`);
      }
      throw err;
    }
  }

  async deleteChecklistTemplateItem(id: string, user?: ActingUser) {
    const existing = await this.repository.findChecklistTemplateItemById(id);
    if (!existing) throw new NotFoundError("Checklist item not found");
    assertWithinScope(resolveDataScope(user), existing.franchiseId, "Checklist item not found");
    if (existing.isDefault) {
      throw new ForbiddenError("Default checklist items cannot be removed.");
    }
    return this.repository.softDeleteChecklistTemplateItem(id);
  }
}
