-- Pre-flight Patch C (Phase 1) — additive only.
-- Three new columns, all with defaults, applied to existing tables.
-- Existing rows: UserPermission.actions becomes '{}', actionsOverride
-- becomes false (== "no override, inherit RolePermission" — the correct
-- behavior-preserving default), RolePermission.actions becomes '{}'.
-- No existing column, row, or table is altered, renamed, or dropped.

-- AlterTable
ALTER TABLE "UserPermission" ADD COLUMN "actions" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "UserPermission" ADD COLUMN "actionsOverride" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RolePermission" ADD COLUMN "actions" TEXT[] NOT NULL DEFAULT '{}';
