import { db } from '../../lib/db.js';

// Phase 4B-2D-C — one item inside a version's immutable snapshot.
// `logicalItemId` links back to QCChecklistTemplate.logicalItemId (the
// stable identity), never to a live QCChecklistTemplate row's own `id`.
export interface VersionItemInput {
  logicalItemId: string;
  label: string;
  category: string;
  order: number;
  mandatory: boolean;
}

export type PublishOutcome =
  | { outcome: 'not-found' }
  | { outcome: 'not-draft'; version: { id: string; versionNumber: number; status: string } }
  | { outcome: 'published'; version: any };

export class QcTemplateVersionRepository {
  async getNextVersionNumber(franchiseId: string | null): Promise<number> {
    const agg = await db.qCChecklistTemplateVersion.aggregate({
      where: { franchiseId },
      _max: { versionNumber: true },
    });
    return (agg._max.versionNumber ?? 0) + 1;
  }

  async createDraftWithItems(franchiseId: string | null, versionNumber: number, createdById: string | null, items: VersionItemInput[]) {
    return db.qCChecklistTemplateVersion.create({
      data: {
        franchiseId,
        versionNumber,
        status: 'Draft',
        createdById,
        items: { create: items },
      },
      include: { items: true },
    });
  }

  // Phase 4B-2D-C — caller (QcTemplateVersionService.updateDraftVersionItems)
  // is responsible for confirming the version is still Draft before calling
  // this; this method itself is unconditional so it stays simple, mirroring
  // how QcRepository.updateChecklistTemplateItem doesn't re-check scope
  // either (that's the service's job, one layer up).
  async replaceDraftItems(versionId: string, items: VersionItemInput[]) {
    return db.$transaction(async (tx) => {
      await tx.qCChecklistTemplateVersionItem.deleteMany({ where: { versionId } });
      return tx.qCChecklistTemplateVersion.update({
        where: { id: versionId },
        data: { items: { create: items } },
        include: { items: true },
      });
    });
  }

  // Phase 4B-2D-D — caller (QcTemplateVersionService.discardDraftVersion)
  // is responsible for confirming Draft status first; onDelete: Cascade on
  // QCChecklistTemplateVersionItem.versionId removes the items automatically.
  async deleteDraft(versionId: string) {
    return db.qCChecklistTemplateVersion.delete({ where: { id: versionId } });
  }

  async findVersionById(id: string) {
    return db.qCChecklistTemplateVersion.findUnique({ where: { id }, include: { items: true } });
  }

  async listVersions(franchiseId: string | null) {
    return db.qCChecklistTemplateVersion.findMany({
      where: { franchiseId },
      orderBy: { versionNumber: 'desc' },
      include: { items: true },
    });
  }

  async findPublishedVersion(franchiseId: string | null) {
    return db.qCChecklistTemplateVersion.findFirst({
      where: { franchiseId, status: 'Published' },
      include: { items: true },
    });
  }

  // Phase 4B-2D-D — THE canonical effective-checklist resolver. Every
  // caller that needs "what checklist is currently effective for this
  // franchise" (today: only QcRepository.buildFrozenChecklist at QC Start)
  // must go through this method — there must be exactly one implementation
  // of this composition rule, not a second one growing independently
  // somewhere else.
  //
  // `tx` is optional so this can run either standalone (a plain read, e.g.
  // for inspection/reporting tooling later) or inside an existing
  // transaction (QC Start's own SELECT-FOR-UPDATE-locked transaction) so
  // the resolve-then-freeze sequence in buildFrozenChecklist is atomic —
  // see that function's own comment for why no *additional* locking is
  // needed here specifically for read consistency (Postgres MVCC already
  // guarantees a single query sees one complete, self-consistent published
  // version + its items, never a torn mix, because items are written once
  // atomically with their version and never mutated after creation).
  //
  // Composition: HQ's current Published version's items, unioned with that
  // franchise's own current Published version's items (if the franchise
  // has ever published one) — never a Draft, never a Superseded version,
  // never another franchise's version. `id` on each returned item is the
  // immutable QCChecklistTemplateVersionItem row id (NOT
  // QCChecklistTemplate.id) — the correct stable identity now that items
  // live in immutable version rows.
  async resolveEffectiveChecklist(franchiseId: string | null, tx?: any): Promise<{
    items: { id: string; label: string; category: string; order: number; mandatory: boolean }[];
    hqVersionId: string | null;
    franchiseVersionId: string | null;
  }> {
    const client = tx ?? db;
    const hqVersion = await client.qCChecklistTemplateVersion.findFirst({
      where: { franchiseId: null, status: 'Published' },
      include: { items: true },
    });
    const franchiseVersion = franchiseId
      ? await client.qCChecklistTemplateVersion.findFirst({
          where: { franchiseId, status: 'Published' },
          include: { items: true },
        })
      : null;

    const hqItems = (hqVersion?.items ?? []) as { id: string; label: string; category: string; order: number; mandatory: boolean }[];
    const franchiseItems = (franchiseVersion?.items ?? []) as { id: string; label: string; category: string; order: number; mandatory: boolean }[];

    // Deterministic ordering — category ASC, order ASC, id ASC — matching
    // the tie-breaker convention established for QCChecklistTemplate
    // (Phase 4B-2C) and preserved for QCChecklistTemplateVersionItem here.
    const items = [...hqItems, ...franchiseItems].sort((a, b) => {
      if (a.category !== b.category) return a.category < b.category ? -1 : 1;
      if (a.order !== b.order) return a.order - b.order;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

    return {
      items,
      hqVersionId: hqVersion?.id ?? null,
      franchiseVersionId: franchiseVersion?.id ?? null,
    };
  }

  // Phase 4B-2D-C — the whole scope's version rows are locked
  // (`SELECT ... FOR UPDATE`) for the duration of the transaction before
  // anything is read or written, exactly the same idiom
  // QcRepository.getOrCreateOpenInspection uses locking the parent Job row:
  // this serializes any concurrent publish attempts for the SAME scope, so
  // "demote the currently-Published version, then promote the target" can
  // never interleave with another publish's own demote-then-promote. The
  // QCChecklistTemplateVersion_one_published_per_scope_key partial unique
  // index remains as a defense-in-depth backstop, not the primary
  // mechanism, matching this codebase's established layering.
  async publishVersion(versionId: string, franchiseId: string | null, publishedById: string | null): Promise<PublishOutcome> {
    return db.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "QCChecklistTemplateVersion"
        WHERE COALESCE("franchiseId", '') = COALESCE(${franchiseId}, '')
        FOR UPDATE
      `;

      const target = await tx.qCChecklistTemplateVersion.findUnique({ where: { id: versionId } });
      if (!target || target.franchiseId !== franchiseId) {
        return { outcome: 'not-found' };
      }
      if (target.status !== 'Draft') {
        return { outcome: 'not-draft', version: target };
      }

      await tx.qCChecklistTemplateVersion.updateMany({
        where: { franchiseId, status: 'Published' },
        data: { status: 'Superseded' },
      });
      await tx.qCChecklistTemplateVersion.update({
        where: { id: versionId },
        data: { status: 'Published', publishedById, publishedAt: new Date() },
      });
      const version = await tx.qCChecklistTemplateVersion.findUniqueOrThrow({
        where: { id: versionId },
        include: { items: true },
      });
      return { outcome: 'published', version };
    });
  }

  // Phase 4B-2D-C — recognizes a violation of either version-model unique
  // index (scope+versionNumber, or one-Published-per-scope), the same way
  // QcRepository.isDuplicateChecklistTemplateError recognizes the
  // checklist-template closure-fix index: Prisma surfaces even DB
  // constraints it doesn't know about from its own schema as a normal
  // P2002 PrismaClientKnownRequestError, keyed off the underlying Postgres
  // 23505 SQLSTATE.
  static isVersionConflictError(err: unknown): boolean {
    const code = (err as { code?: string } | undefined)?.code;
    if (code === 'P2002') return true;
    const message = String((err as { message?: string } | undefined)?.message || '');
    return (
      message.includes('QCChecklistTemplateVersion_scope_version_number_key') ||
      message.includes('QCChecklistTemplateVersion_one_published_per_scope_key')
    );
  }
}
