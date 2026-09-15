-- Phase 4B-2C closure fix — concurrency-safe checklist-template duplicate
-- prevention.
--
-- The application-level check in QcRepository.findChecklistTemplateDuplicate
-- is TOCTOU-vulnerable: two concurrent requests can both read "no duplicate
-- found" before either commits, and both then insert. This index makes
-- Postgres itself the final arbiter; the application check is kept as a
-- fast, friendly pre-check (see qc.service.ts), not removed.
--
-- Scope handling: COALESCE("franchiseId", '') maps every global (NULL) row
-- into the same '' bucket, so two concurrent global inserts collide with
-- each other exactly like two concurrent same-franchise inserts do. A plain
-- UNIQUE("franchiseId", category, label) cannot do this — Postgres treats
-- every NULL as distinct from every other NULL, so it would silently allow
-- unlimited duplicate global rows. Two different real franchiseId values
-- are still compared as themselves, so Franchise A and Franchise B remain
-- free to share a (category, label) pair — this index does not introduce
-- cross-franchise uniqueness, which would foreclose future per-franchise
-- override design.
--
-- Case handling: lower(category)/lower(label) matches the case-insensitive
-- semantics the existing Prisma `mode: 'insensitive'` application check
-- already implements. No trimming is applied — the pre-existing application
-- check never trimmed whitespace either, so this preserves that behavior
-- rather than inventing a new normalization rule.
--
-- Soft-deleted rows are excluded (WHERE "isDeleted" = false) so a
-- previously deleted item never blocks re-creating a new item with the same
-- name, matching findChecklistTemplateDuplicate's own isDeleted filter.
--
-- Verified against live data immediately before this migration: 18 rows,
-- 0 rows would collide under this exact index definition.
CREATE UNIQUE INDEX "QCChecklistTemplate_scope_category_label_ci_key"
ON "QCChecklistTemplate" (
  COALESCE("franchiseId", ''),
  lower(category),
  lower(label)
)
WHERE "isDeleted" = false;
