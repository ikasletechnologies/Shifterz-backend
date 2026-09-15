-- Phase 4B-2D-D — a second, independent nullable version reference on
-- QCInspection. The effective checklist is composed from an HQ published
-- version (existing templateVersionId, added but left unpopulated in Phase
-- 4B-2D-C) plus, optionally, that job's franchise's own published version —
-- two genuinely independent scopes, so one id cannot describe both without
-- being misleading (per the Phase 4B-2D-B discovery's explicit warning).
--
-- Verified immediately before this migration: 0 QCInspection rows exist, so
-- there is no historical row to backfill or reconcile.
ALTER TABLE "QCInspection" ADD COLUMN "franchiseTemplateVersionId" TEXT;
ALTER TABLE "QCInspection" ADD CONSTRAINT "QCInspection_franchiseTemplateVersionId_fkey"
    FOREIGN KEY ("franchiseTemplateVersionId") REFERENCES "QCChecklistTemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
