-- INV-05 — additive only, nullable, no default needed. Existing
-- InventoryRequest rows: requestedById/requestedBy become NULL (the
-- self-approval check simply cannot trigger for those legacy rows). No
-- existing column, row, or table is altered, renamed, or dropped.

-- AlterTable
ALTER TABLE "InventoryRequest" ADD COLUMN "requestedById" TEXT;
ALTER TABLE "InventoryRequest" ADD COLUMN "requestedBy" TEXT;
