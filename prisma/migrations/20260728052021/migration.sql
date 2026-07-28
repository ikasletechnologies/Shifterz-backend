/*
  Warnings:

  - You are about to drop the column `technicianIn` on the `CarIn` table. All the data in the column will be lost.
  - You are about to drop the column `actualCompletion` on the `Job` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CarIn" DROP COLUMN "technicianIn";

-- AlterTable
ALTER TABLE "Job" DROP COLUMN "actualCompletion";
