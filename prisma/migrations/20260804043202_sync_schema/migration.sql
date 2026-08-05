-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "actualCompletion" TIMESTAMP(3),
ADD COLUMN     "checklist" JSONB,
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "isRework" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passedAt" TIMESTAMP(3),
ADD COLUMN     "qcBy" TEXT,
ADD COLUMN     "qcById" TEXT,
ADD COLUMN     "qcNotes" TEXT,
ADD COLUMN     "qcPhotos" TEXT[] DEFAULT ARRAY[]::text[],
ADD COLUMN     "reworkCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "serviceAdvisor" TEXT,
ADD COLUMN     "serviceAdvisorId" TEXT;
