-- Phase 4B-2D-C — QC template governance foundation: stable logical item
-- identity, whole-template immutable versioning (Model B, per the Phase
-- 4B-2D-B discovery's recommendation), and a nullable historical-reference
-- field on QCInspection. Purely additive; no existing row is deleted or
-- destructively rewritten.
--
-- Verified immediately before this migration: 18 live QCChecklistTemplate
-- rows (all global/HQ, franchiseId=null), 0 franchise rows, 0 soft-deleted,
-- 0 duplicates, 0 QCInspection rows.

-- ─── Part 3: stable logical item identity on QCChecklistTemplate ───────────
-- Added nullable first, backfilled, then locked to NOT NULL — required
-- because the table already has 18 rows and a NOT NULL column can't be
-- added in one step without either a literal default or this two-phase
-- approach. gen_random_uuid() is built into PostgreSQL core since v13 (this
-- environment runs v15) — no extension required.
ALTER TABLE "QCChecklistTemplate" ADD COLUMN "logicalItemId" TEXT;
UPDATE "QCChecklistTemplate" SET "logicalItemId" = gen_random_uuid()::text WHERE "logicalItemId" IS NULL;
ALTER TABLE "QCChecklistTemplate" ALTER COLUMN "logicalItemId" SET NOT NULL;
ALTER TABLE "QCChecklistTemplate" ALTER COLUMN "logicalItemId" SET DEFAULT gen_random_uuid()::text;

-- ─── Part 4/6/7: whole-template version + version-item tables ──────────────
CREATE TABLE "QCChecklistTemplateVersion" (
    "id" TEXT NOT NULL,
    "franchiseId" TEXT,
    "versionNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "QCChecklistTemplateVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QCChecklistTemplateVersionItem" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "logicalItemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "mandatory" BOOLEAN NOT NULL,

    CONSTRAINT "QCChecklistTemplateVersionItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "QCChecklistTemplateVersion" ADD CONSTRAINT "QCChecklistTemplateVersion_franchiseId_fkey"
    FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QCChecklistTemplateVersionItem" ADD CONSTRAINT "QCChecklistTemplateVersionItem_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "QCChecklistTemplateVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "QCChecklistTemplateVersionItem_versionId_idx" ON "QCChecklistTemplateVersionItem"("versionId");

-- ─── Part 16: version-scoping / numbering / publication constraints ────────
-- Same NULL-handling lesson as the Phase 4B-2C closure fix
-- (QCChecklistTemplate_scope_category_label_ci_key): a plain
-- UNIQUE("franchiseId", "versionNumber") would let unlimited global
-- versions share the same versionNumber, because Postgres never considers
-- two NULLs equal. COALESCE("franchiseId", '') maps every global row into
-- one '' bucket so global version numbers collide with each other exactly
-- like same-franchise version numbers do.
--
-- This index applies to every version regardless of status — a version
-- number is unique within its scope for its whole lifetime (Draft,
-- Published, or Superseded), not just while Published.
CREATE UNIQUE INDEX "QCChecklistTemplateVersion_scope_version_number_key"
ON "QCChecklistTemplateVersion" (COALESCE("franchiseId", ''), "versionNumber");

-- At most one Published version per scope at any time. Partial (WHERE
-- status = 'Published') so any number of Draft/Superseded versions may
-- coexist per scope — only the Published slot is constrained to one.
CREATE UNIQUE INDEX "QCChecklistTemplateVersion_one_published_per_scope_key"
ON "QCChecklistTemplateVersion" (COALESCE("franchiseId", ''))
WHERE "status" = 'Published';

-- ─── Part 12: QCInspection historical version reference ────────────────────
-- Nullable and NOT populated by this phase (see the schema.prisma comment
-- on QCInspection.templateVersionId for why) — buildFrozenChecklist still
-- resolves checklistDefinition from live QCChecklistTemplate rows.
ALTER TABLE "QCInspection" ADD COLUMN "templateVersionId" TEXT;
ALTER TABLE "QCInspection" ADD CONSTRAINT "QCInspection_templateVersionId_fkey"
    FOREIGN KEY ("templateVersionId") REFERENCES "QCChecklistTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
