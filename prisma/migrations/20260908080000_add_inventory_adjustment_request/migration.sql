-- INV-04 — additive only. New table, no existing table/column/row altered,
-- renamed, or dropped.

-- CreateTable
CREATE TABLE "InventoryAdjustmentRequest" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "requestedQty" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "requestedById" TEXT,
    "requestedBy" TEXT,
    "approvedById" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "franchiseId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryAdjustmentRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InventoryAdjustmentRequest" ADD CONSTRAINT "InventoryAdjustmentRequest_franchiseId_fkey" FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
