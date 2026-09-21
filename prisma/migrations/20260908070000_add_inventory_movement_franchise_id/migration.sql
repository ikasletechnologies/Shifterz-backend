-- INV-02 — additive only, nullable, no default needed.
-- Existing InventoryMovement rows: franchiseId becomes NULL (legacy rows
-- stay scoped via the itemId -> Inventory.franchiseId join, as they always
-- were; this column is populated only for movements written going
-- forward). No existing column, row, or table is altered, renamed, or
-- dropped.

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN "franchiseId" TEXT;
