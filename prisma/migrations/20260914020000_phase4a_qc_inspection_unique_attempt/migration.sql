-- Phase 4A — QC Core Integrity
-- Run `scripts/phase4a-dedupe-qc-inspections.ts` first in any environment that
-- may already hold duplicate (jobId, attemptNumber) rows; this constraint will
-- fail to apply otherwise.

-- CreateIndex
CREATE UNIQUE INDEX "QCInspection_jobId_attemptNumber_key" ON "QCInspection"("jobId", "attemptNumber");
