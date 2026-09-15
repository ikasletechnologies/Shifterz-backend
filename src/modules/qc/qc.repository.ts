import { db } from '../../lib/db.js';
import type { CreateChecklistTemplateItemDTO, UpdateChecklistTemplateItemDTO } from './qc.validation.js';
import type { DataScope } from '../../shared/scope/dataScope.js';
import { scopeWhere } from '../../shared/scope/dataScope.js';
import { QcTemplateVersionRepository } from './qc-template-version.repository.js';

const QC_QUEUE_STATUSES = ['Waiting for Quality Check', 'Inspecting', 'Rework Required'];

// Phase 4B-2D-A — one item of the checklist DEFINITION frozen onto
// QCInspection.checklistDefinition at Start: id/label/category/order/
// mandatory, copied by value from QCChecklistTemplate exactly once and never
// re-read from it again for this attempt. Deliberately has no result/remark
// — those live only on QCInspection.checklist (Phase 4B-2C), which continues
// to hold just the items actually submitted so far (see submitChecklist);
// this type is the separate, complete "what exists and what's mandatory"
// record that checklist-submission validation and mandatory-completeness
// checking both read instead of re-querying QCChecklistTemplate.
export interface FrozenChecklistItem {
  id: string;
  label: string;
  category: string;
  order: number;
  mandatory: boolean;
}

// Phase 4B-2D-D — no longer reads live QCChecklistTemplate rows at all.
// Resolves through QcTemplateVersionRepository.resolveEffectiveChecklist —
// the ONE canonical effective-checklist resolver (HQ's current Published
// version + that franchise's current Published version, never a Draft or
// Superseded version) — via the transaction client `tx` so the resolve,
// the freeze, and the two version-id references written alongside it
// (QCInspection.templateVersionId / franchiseTemplateVersionId) all commit
// atomically together. Called only from inside getOrCreateOpenInspection/
// createAssignedInspection's existing SELECT-FOR-UPDATE transactions — no
// caller can observe a QCInspection whose checklistDefinition was resolved
// outside that same transaction, and no caller can observe checklistDefinition
// content that doesn't match its own recorded version references (Part 15's
// atomicity requirement). No *additional* locking is needed here for read
// consistency beyond that existing transaction boundary — see
// resolveEffectiveChecklist's own comment for why Postgres's normal MVCC
// snapshot semantics already rule out a torn read against a concurrent
// publish. `tx` is typed `any` for the same reason as elsewhere in this
// file: Prisma's generated transaction-client type isn't imported here.
const versionRepository = new QcTemplateVersionRepository();

async function buildFrozenChecklist(tx: any, franchiseId: string | null): Promise<{
  items: FrozenChecklistItem[];
  templateVersionId: string | null;
  franchiseTemplateVersionId: string | null;
}> {
  const resolved = await versionRepository.resolveEffectiveChecklist(franchiseId, tx);
  return {
    items: resolved.items.map((i) => ({
      id: i.id,
      label: i.label,
      category: i.category,
      order: i.order,
      mandatory: i.mandatory,
    })),
    templateVersionId: resolved.hqVersionId,
    franchiseTemplateVersionId: resolved.franchiseVersionId,
  };
}

export class QcRepository {
  // ─── QC Queue ─────────────────────────────────────────────────────────────

  async getQueue(franchiseId: string | null) {
    const where: any = { isDeleted: false, status: { in: QC_QUEUE_STATUSES } };
    if (franchiseId) where.franchiseId = franchiseId;
    return db.job.findMany({ where, orderBy: { updatedAt: 'asc' } });
  }

  // ─── QC Inspections (attempts) ────────────────────────────────────────────

  async findOpenInspection(jobId: string) {
    return db.qCInspection.findFirst({
      where: { jobId, result: 'Pending' },
      orderBy: { attemptNumber: 'desc' },
    });
  }

  // Latest attempt regardless of result — used for decision idempotency checks,
  // where a already-finalized inspection is a valid (not-open) state to inspect.
  async findLatestInspection(jobId: string) {
    return db.qCInspection.findFirst({
      where: { jobId },
      orderBy: { attemptNumber: 'desc' },
    });
  }

  // Phase 4A — Concurrency (Lazy Start). Locks the parent Job row for the
  // duration of the transaction (`SELECT ... FOR UPDATE`) so that concurrent
  // callers racing to lazy-start QC for the same job serialize on it: the
  // first to acquire the lock creates the attempt, every other waiter then
  // sees that committed row via its own read inside the transaction and
  // returns it instead of creating a duplicate. The `@@unique([jobId,
  // attemptNumber])` DB constraint is the defense-in-depth backstop if this
  // invariant is ever bypassed by a caller that doesn't go through here.
  async getOrCreateOpenInspection(jobId: string, data: {
    inspectorId?: string | null; inspectorName?: string | null;
  }) {
    return db.$transaction(async (tx) => {
      const jobs = await tx.$queryRaw<{ id: string; franchiseId: string | null; qcAttemptCount: number }[]>`
        SELECT "id", "franchiseId", "qcAttemptCount" FROM "Job" WHERE "id" = ${jobId} FOR UPDATE
      `;
      const job = jobs[0];
      if (!job) return null;

      const existing = await tx.qCInspection.findFirst({
        where: { jobId, result: 'Pending' },
        orderBy: { attemptNumber: 'desc' },
      });
      if (existing) return existing;

      const updatedJob = await tx.job.update({
        where: { id: jobId },
        data: { qcAttemptCount: { increment: 1 } },
      });

      // Phase 4B-2D-A — freeze the effective checklist at the moment this
      // attempt is actually created, not "the moment the caller asked": a
      // concurrent racer that lost the `existing` check above never reaches
      // here at all — it just observes the winner's already-frozen row.
      const frozen = await buildFrozenChecklist(tx, job.franchiseId);

      return tx.qCInspection.create({
        data: {
          jobId,
          attemptNumber: updatedJob.qcAttemptCount,
          inspectorId: data.inspectorId || null,
          inspectorName: data.inspectorName || null,
          franchiseId: job.franchiseId,
          checklistDefinition: frozen.items as any, // Prisma Json input typing; see FrozenChecklistItem for the real shape
          templateVersionId: frozen.templateVersionId,
          franchiseTemplateVersionId: frozen.franchiseTemplateVersionId,
        },
      });
    });
  }

  // Explicit management-initiated assignment (12.3). Phase 4B-2A — shares the
  // exact row-lock + "check-for-existing-Pending-first" pattern as
  // getOrCreateOpenInspection, so an assignment racing a lazy-start (or
  // another concurrent assignment) can never produce two simultaneous
  // Pending attempts for one job. Before this fix, this method always
  // created a fresh attempt regardless of an existing open one, so two
  // managers assigning concurrently could each "win" and leave one Pending
  // attempt permanently orphaned (every read path only ever surfaces the
  // highest attemptNumber). If a Pending attempt already exists, it is
  // returned as-is — this method does not reassign/overwrite its inspector,
  // since there is no reassignment concept in the current API (that's a
  // separate, not-yet-decided policy question).
  async createAssignedInspection(jobId: string, data: {
    inspectorId?: string | null; inspectorName?: string | null;
    scheduledAt?: Date | null; priority?: string | null; assignRemarks?: string | null;
  }) {
    return db.$transaction(async (tx) => {
      const jobs = await tx.$queryRaw<{ id: string; franchiseId: string | null; qcAttemptCount: number }[]>`
        SELECT "id", "franchiseId", "qcAttemptCount" FROM "Job" WHERE "id" = ${jobId} FOR UPDATE
      `;
      const job = jobs[0];
      if (!job) return null;

      const existing = await tx.qCInspection.findFirst({
        where: { jobId, result: 'Pending' },
        orderBy: { attemptNumber: 'desc' },
      });
      if (existing) return existing;

      const updatedJob = await tx.job.update({
        where: { id: jobId },
        data: { qcAttemptCount: { increment: 1 } },
      });

      // Phase 4B-2D-A — same freeze-at-creation as getOrCreateOpenInspection
      // above; whichever of the two paths actually creates the row is the
      // one that determines this attempt's frozen checklist.
      const frozen = await buildFrozenChecklist(tx, job.franchiseId);

      return tx.qCInspection.create({
        data: {
          jobId,
          attemptNumber: updatedJob.qcAttemptCount,
          inspectorId: data.inspectorId || null,
          inspectorName: data.inspectorName || null,
          scheduledAt: data.scheduledAt || null,
          priority: data.priority || null,
          assignRemarks: data.assignRemarks || null,
          franchiseId: job.franchiseId,
          checklistDefinition: frozen.items as any, // Prisma Json input typing; see FrozenChecklistItem for the real shape
          templateVersionId: frozen.templateVersionId,
          franchiseTemplateVersionId: frozen.franchiseTemplateVersionId,
        },
      });
    });
  }

  // Phase 4B-2A — defense-in-depth against mutating a finalized attempt.
  // Conditional on result:'Pending' so the write silently no-ops (returns
  // null) if the attempt was decided in the narrow window between the
  // caller resolving it and this write — the caller is responsible for
  // turning a null into a domain error. The primary protection is still
  // getOrCreateOpenInspection only ever handing back a Pending attempt in
  // the first place; this is the backstop, not the mechanism.
  async updateInspection(id: string, data: any) {
    const result = await db.qCInspection.updateMany({
      where: { id, result: 'Pending' },
      data,
    });
    if (result.count === 0) return null;
    return db.qCInspection.findUnique({ where: { id } });
  }

  async findInspectionById(id: string) {
    return db.qCInspection.findFirst({ where: { id } });
  }

  async listInspections(jobId: string) {
    return db.qCInspection.findMany({
      where: { jobId },
      orderBy: { attemptNumber: 'desc' },
      include: { photos: true },
    });
  }

  // ─── QC Decision (12.6) ─────────────────────────────────────────────────────

  // Phase 4A closure fix — Concurrency-safe decision transition. The
  // Pending -> terminal transition is made authoritative by a conditional
  // `updateMany(... WHERE result = 'Pending')` INSIDE the transaction, not by
  // a read performed beforehand. Postgres takes the necessary row lock as
  // part of evaluating that WHERE clause, so of any number of concurrent
  // callers racing on the same inspection, exactly one UPDATE matches a row
  // (count === 1, this call "wins" and applies the Job mutation + JobHistory
  // write in the same transaction); every other concurrent caller's UPDATE
  // matches zero rows (count === 0) once the winner has committed, because by
  // then the row is no longer Pending — they re-read and classify the result
  // as an idempotent retry (same result) or a genuine conflict (different
  // result), without touching Job or JobHistory again. This is the same
  // conditional-update pattern already used by
  // JobCardService.resolveMaterialConsumption for the same reason.
  async recordDecision(jobId: string, inspectionId: string, data: {
    result: 'Passed' | 'Failed';
    reason?: string | null;
    remarks?: string | null;
    reworkRequired?: boolean;
    performedBy: string;
  }) {
    return db.$transaction(async (tx) => {
      const claim = await tx.qCInspection.updateMany({
        where: { id: inspectionId, result: 'Pending' },
        data: {
          result: data.result,
          reason: data.reason ?? null,
          remarks: data.remarks ?? null,
          reworkRequired: data.result === 'Failed' ? (data.reworkRequired ?? true) : false,
          decidedAt: new Date(),
        },
      });

      if (claim.count === 1) {
        // Won the race (or was the only caller) — apply the authoritative
        // Job mutation and JobHistory write in this same transaction.
        const inspection = await tx.qCInspection.findUniqueOrThrow({ where: { id: inspectionId } });

        const job = data.result === 'Passed'
          ? await tx.job.update({ where: { id: jobId }, data: { status: 'Ready For Billing', passedAt: new Date() } })
          : await tx.job.update({
            where: { id: jobId },
            data: { status: 'Rework Required', failedAt: new Date(), isRework: true, reworkCount: { increment: 1 } },
          });

        await tx.jobHistory.create({
          data: {
            jobId,
            event: data.result === 'Passed' ? 'QC_PASSED' : 'QC_FAILED',
            performedBy: data.performedBy,
            payload: {
              inspectionId,
              attemptNumber: inspection.attemptNumber,
              result: data.result,
              reason: data.reason || null,
              remarks: data.remarks || null,
            },
          },
        });

        return { outcome: 'applied' as const, inspection, job };
      }

      // Lost the race, or the inspection simply wasn't Pending to begin with
      // (a genuinely stale retry) — either way, someone already finalized
      // this attempt. No Job or JobHistory mutation here.
      const inspection = await tx.qCInspection.findUniqueOrThrow({ where: { id: inspectionId } });
      const job = await tx.job.findUniqueOrThrow({ where: { id: jobId } });
      const outcome = inspection.result === data.result ? ('already-same' as const) : ('conflict' as const);
      return { outcome, inspection, job };
    });
  }

  // ─── QC Photos ────────────────────────────────────────────────────────────

  async createQcPhotos(jobId: string, qcInspectionId: string, category: string, urls: string[], user?: { id?: string; name?: string; franchiseId?: string | null }) {
    await db.jobPhoto.createMany({
      data: urls.map((url) => ({
        jobId,
        url,
        category,
        qcInspectionId,
        uploadedById: user?.id || null,
        uploadedBy: user?.name || null,
        franchiseId: user?.franchiseId || null,
      })),
    });
    return db.jobPhoto.findMany({ where: { qcInspectionId }, orderBy: { createdAt: 'desc' } });
  }

  // ─── Checklist Template (12.4) ────────────────────────────────────────────

  async findChecklistTemplate(franchiseId: string | null) {
    return db.qCChecklistTemplate.findMany({
      where: {
        isDeleted: false,
        OR: [{ franchiseId: null }, { franchiseId: franchiseId || undefined }],
      },
      // Phase 4B-2C — `id` added as a deterministic tie-breaker. Two items
      // sharing the same (category, order) — e.g. one global, one franchise
      // — previously had undefined relative ordering (Postgres does not
      // guarantee stable output for tied sort keys without one).
      orderBy: [{ category: 'asc' }, { order: 'asc' }, { id: 'asc' }],
    });
  }

  async findChecklistTemplateItemById(id: string) {
    return db.qCChecklistTemplate.findFirst({ where: { id, isDeleted: false } });
  }

  // Phase 4B-2C — application-level duplicate guard. This is the fast,
  // friendly pre-check only: it reads-then-decides, so two concurrent
  // requests can both see "no duplicate" before either commits and both
  // proceed to insert (TOCTOU). It is NOT the concurrency guarantee — see
  // the closure-fix migration `20260915010000_phase4b2c_closure_template_
  // duplicate_index`, which adds a partial, case-insensitive unique index
  // (`QCChecklistTemplate_scope_category_label_ci_key`) using
  // `COALESCE("franchiseId", '')` so that global (NULL-franchiseId) rows
  // collide with each other the same way same-franchise rows do — a plain
  // `@@unique([franchiseId, category, label])` can't do that, since Postgres
  // never considers two NULLs equal. That index is the actual concurrency
  // backstop; this method just produces a nicer error in the common
  // (non-racing) case. See isDuplicateChecklistTemplateError below for how
  // callers translate an index violation into the same user-facing error.
  async findChecklistTemplateDuplicate(category: string, label: string, franchiseId: string | null, excludeId?: string) {
    return db.qCChecklistTemplate.findFirst({
      where: {
        isDeleted: false,
        franchiseId,
        category: { equals: category, mode: 'insensitive' },
        label: { equals: label, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  async createChecklistTemplateItem(data: CreateChecklistTemplateItemDTO) {
    return db.qCChecklistTemplate.create({
      data: {
        category: data.category,
        label: data.label,
        order: data.order ?? 0,
        franchiseId: data.franchiseId || null,
        mandatory: data.mandatory ?? false,
      },
    });
  }

  async updateChecklistTemplateItem(id: string, data: UpdateChecklistTemplateItemDTO) {
    return db.qCChecklistTemplate.update({ where: { id }, data });
  }

  async softDeleteChecklistTemplateItem(id: string) {
    return db.qCChecklistTemplate.update({ where: { id }, data: { isDeleted: true } });
  }

  // Phase 4B-2C closure fix — recognizes a violation of the
  // QCChecklistTemplate_scope_category_label_ci_key partial unique index
  // (verified empirically: Prisma surfaces even DB-level constraints it
  // doesn't know about from its own schema as a normal P2002
  // PrismaClientKnownRequestError, keyed off the underlying Postgres 23505
  // SQLSTATE). Callers use this to translate the raw DB error into the same
  // domain ValidationError the pre-check throws, instead of letting a
  // Prisma/Postgres error escape to the API consumer as an opaque 500.
  static isDuplicateChecklistTemplateError(err: unknown): boolean {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === 'P2002') return true;
    const message = String((err as { message?: string } | undefined)?.message || '');
    return message.includes('QCChecklistTemplate_scope_category_label_ci_key');
  }

  // ─── Job lookup (used by service for gating/notifications) ────────────────

  async findJobById(jobId: string, scope: DataScope) {
    return db.job.findFirst({ where: { id: jobId, isDeleted: false, ...scopeWhere(scope) } });
  }

  async updateJob(jobId: string, data: any) {
    return db.job.update({ where: { id: jobId }, data });
  }
}
