import { randomUUID } from 'crypto';
import { QcTemplateVersionRepository } from './qc-template-version.repository.js';
import type { VersionItemInput } from './qc-template-version.repository.js';
import { ForbiddenError } from '../../shared/errors/ForbiddenError.js';
import { ValidationError } from '../../shared/errors/ValidationError.js';
import { NotFoundError } from '../../shared/errors/NotFoundError.js';
import { resolveDataScope, assertWithinScope } from '../../shared/scope/dataScope.js';

const HQ_ROLES = ['SUPER_ADMIN', 'HQ_USER'];
const normalizeRole = (role?: string) => (role || '').toUpperCase().replace(/[\s_]+/g, '_');

type ActingUser = { id?: string; name?: string; role?: string; franchiseId?: string | null };

// Phase 4B-2D-D — HTTP callers (qc.validation.ts's versionItemSchema) may
// omit logicalItemId: absent means "a brand-new conceptual item," present
// means "the evolved definition of an existing logical item" (e.g. carried
// forward from a prior version). Internal callers (bootstrap script, tests)
// continue to pass it explicitly, matching VersionItemInput exactly.
type VersionItemDraftInput = Omit<VersionItemInput, 'logicalItemId'> & { logicalItemId?: string };

function fillLogicalItemIds(items: VersionItemDraftInput[]): VersionItemInput[] {
  return items.map((item) => ({ ...item, logicalItemId: item.logicalItemId || randomUUID() }));
}

// Phase 4B-2D-C built the whole-template version governance model (approved
// Model B from the Phase 4B-2D-B discovery) unexposed. Phase 4B-2D-D wires
// it to real HTTP endpoints (qc.routes.ts, gated by qc:templates:manage /
// qc:templates:publish, D-22) and makes it authoritative: QcRepository.
// buildFrozenChecklist now resolves the effective checklist through
// QcTemplateVersionRepository.resolveEffectiveChecklist instead of live
// QCChecklistTemplate rows. There is still no draft/publish frontend UI —
// only the backend surface exists so far.
export class QcTemplateVersionService {
  constructor(private readonly repository: QcTemplateVersionRepository = new QcTemplateVersionRepository()) {}

  private assertNoInternalDuplicates(items: VersionItemInput[]) {
    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.category.toLowerCase()}::${item.label.toLowerCase()}`;
      if (seen.has(key)) {
        throw new ValidationError(
          `Duplicate checklist item within this version: category "${item.category}", label "${item.label}".`
        );
      }
      seen.add(key);
    }
  }

  // Phase 4B-2D-D — additions-only enforcement (approved business rule #2):
  // a franchise addition must never represent the same conceptual item as
  // an HQ item, since franchises have no override/replace mechanism at all.
  // Checked against the CURRENT HQ Published version at Draft
  // create/edit time (not at resolve/QC-Start time) — rejecting a mistake
  // here, before it's ever published, is far better than silently letting
  // an ambiguous "is this an override or a coincidence" pair reach an
  // effective checklist. Case-insensitive on (category, label), matching
  // the same comparison QCChecklistTemplate's own closure-fix index uses.
  // HQ's own Draft is never checked against itself here — an HQ actor
  // editing the HQ Draft cannot "collide with HQ."
  private async assertNoHqCollision(scope: string | null, items: VersionItemInput[]) {
    if (scope === null) return;
    const hqVersion = await this.repository.findPublishedVersion(null);
    if (!hqVersion) return;
    const hqKeys = new Set(
      (hqVersion.items as { category: string; label: string }[]).map(
        (i) => `${i.category.toLowerCase()}::${i.label.toLowerCase()}`
      )
    );
    const collisions = items.filter((item) => hqKeys.has(`${item.category.toLowerCase()}::${item.label.toLowerCase()}`));
    if (collisions.length > 0) {
      throw new ValidationError(
        `Franchise addition(s) collide with the current HQ standard: ${collisions
          .map((c) => `"${c.label}" (${c.category})`)
          .join(', ')}. A franchise addition must represent a distinct item, never the same conceptual item as an HQ item — this is an additions-only model with no override.`
      );
    }
  }

  // Phase 4B-2D-C — mirrors QcService.createChecklistTemplateItem's own
  // HQ-vs-franchise rule exactly (same two hardcoded HQ_ROLES, same
  // "franchise actor is always forced into their own franchiseId,
  // regardless of what they ask for" behavior). A franchise actor can never
  // create/publish a global-scope version, and never another franchise's.
  private resolveOwnScope(user?: ActingUser): string | null {
    const isHq = HQ_ROLES.includes(normalizeRole(user?.role));
    if (isHq) return null;
    if (!user?.franchiseId) {
      throw new ForbiddenError("Only HQ may manage the global checklist template.");
    }
    return user.franchiseId;
  }

  async createDraftVersion(rawItems: VersionItemDraftInput[], user?: ActingUser) {
    const scope = this.resolveOwnScope(user);
    if (rawItems.length === 0) {
      throw new ValidationError("A template version must contain at least one checklist item.");
    }
    const items = fillLogicalItemIds(rawItems);
    this.assertNoInternalDuplicates(items);
    await this.assertNoHqCollision(scope, items);
    // Phase 4B-2D-C — TOCTOU-vulnerable pre-check (same shape as the
    // Phase 4B-2C closure-fix's template-duplicate pre-check): two
    // concurrent callers can both compute the same "next" version number
    // before either commits. The DB's scope+versionNumber unique index is
    // the actual backstop; a violation surfaces here as a clean domain
    // error rather than a raw Prisma/Postgres error — deliberately NOT
    // auto-retried, matching this codebase's established precedent of
    // "fail cleanly, let the caller decide whether to retry."
    const versionNumber = await this.repository.getNextVersionNumber(scope);
    try {
      return await this.repository.createDraftWithItems(scope, versionNumber, user?.id || null, items);
    } catch (err) {
      if (QcTemplateVersionRepository.isVersionConflictError(err)) {
        throw new ValidationError(
          `A template version already exists with number ${versionNumber} for this scope — this was a concurrent creation race; retry.`
        );
      }
      throw err;
    }
  }

  // Phase 4B-2D-C — the only mutation path for a version's items after
  // creation. Explicitly guarded: Published and Superseded versions can
  // never reach the repository's replaceDraftItems at all if this check
  // rejects first — there is no other code path anywhere that calls
  // replaceDraftItems, so this guard is the complete protection, not
  // defense-in-depth for some other bypassable route.
  async updateDraftVersionItems(versionId: string, rawItems: VersionItemDraftInput[], user?: ActingUser) {
    const scope = this.resolveOwnScope(user);
    const existing = await this.repository.findVersionById(versionId);
    if (!existing || existing.franchiseId !== scope) {
      throw new NotFoundError('Template version not found');
    }
    if (existing.status !== 'Draft') {
      throw new ValidationError(
        `Version ${existing.versionNumber} is "${existing.status}" and cannot be modified — only a Draft version may be edited.`
      );
    }
    if (rawItems.length === 0) {
      throw new ValidationError('A template version must contain at least one checklist item.');
    }
    const items = fillLogicalItemIds(rawItems);
    this.assertNoInternalDuplicates(items);
    await this.assertNoHqCollision(scope, items);
    return this.repository.replaceDraftItems(versionId, items);
  }

  // Phase 4B-2D-D — Part 8's "delete/discard Draft only." A Draft that was
  // never published has no historical significance, so a hard delete is
  // safe here specifically — this must never be reachable for a Published
  // or Superseded version (both remain permanently queryable, per approved
  // business rule #19/#20), enforced by the same status guard
  // updateDraftVersionItems already uses.
  async discardDraftVersion(versionId: string, user?: ActingUser) {
    const scope = this.resolveOwnScope(user);
    const existing = await this.repository.findVersionById(versionId);
    if (!existing || existing.franchiseId !== scope) {
      throw new NotFoundError('Template version not found');
    }
    if (existing.status !== 'Draft') {
      throw new ValidationError(
        `Version ${existing.versionNumber} is "${existing.status}" and cannot be discarded — only a Draft version may be deleted. Published and Superseded versions remain permanently queryable.`
      );
    }
    await this.repository.deleteDraft(versionId);
    return existing;
  }

  async publishVersion(versionId: string, user?: ActingUser) {
    const scope = this.resolveOwnScope(user);
    let outcome;
    try {
      outcome = await this.repository.publishVersion(versionId, scope, user?.id || null);
    } catch (err) {
      if (QcTemplateVersionRepository.isVersionConflictError(err)) {
        throw new ValidationError('Another publish for this scope completed concurrently — retry.');
      }
      throw err;
    }
    if (outcome.outcome === 'not-found') {
      throw new NotFoundError('Template version not found');
    }
    if (outcome.outcome === 'not-draft') {
      throw new ValidationError(
        `Version ${outcome.version.versionNumber} is already "${outcome.version.status}" and cannot be published again.`
      );
    }
    return outcome.version;
  }

  async getVersionById(id: string, user?: ActingUser) {
    const version = await this.repository.findVersionById(id);
    if (!version) throw new NotFoundError('Template version not found');
    assertWithinScope(resolveDataScope(user), version.franchiseId, 'Template version not found');
    return version;
  }

  async listVersions(user?: ActingUser) {
    const scope = resolveDataScope(user);
    // HQ (unrestricted) sees the HQ/global scope's own versions here, not
    // an aggregate of every franchise's versions — no such cross-franchise
    // listing view exists in this phase.
    return this.repository.listVersions(scope.unrestricted ? null : scope.franchiseId);
  }

  async getPublishedVersion(franchiseId: string | null) {
    return this.repository.findPublishedVersion(franchiseId);
  }
}
