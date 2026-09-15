-- Phase 4B-2C — checklist item mandatory state.
-- Purely additive: default false preserves current behavior for all 18
-- existing QCChecklistTemplate rows (nothing was ever mandatory before this
-- phase). No QCInspection rows exist in this environment, so there is no
-- checklist-snapshot backfill concern.

-- AlterTable
ALTER TABLE "QCChecklistTemplate" ADD COLUMN "mandatory" BOOLEAN NOT NULL DEFAULT false;
