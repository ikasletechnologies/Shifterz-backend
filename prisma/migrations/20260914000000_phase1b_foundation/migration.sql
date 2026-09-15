-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AuditLog_recordId_createdAt_idx" ON "AuditLog"("recordId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_branchId_createdAt_idx" ON "AuditLog"("branchId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_module_action_createdAt_idx" ON "AuditLog"("module", "action", "createdAt" DESC);
