// Phase 4A pre-migration safety script.
//
// The upcoming migration adds `@@unique([jobId, attemptNumber])` to QCInspection
// to make attempt-number allocation collision-proof at the DB level. If any
// (jobId, attemptNumber) pair currently has duplicates, that migration will
// fail. This script finds and resolves them before the migration runs:
//   - a duplicate with no recorded progress (still "Pending", no checklist)
//     is treated as an orphan from a past race and deleted
//   - a duplicate that already has real progress (a decision or a checklist)
//     is renumbered to the next free attempt slot for that job, and the job's
//     qcAttemptCount is bumped to match, so no inspection data is lost
//
// Safe to run repeatedly: a clean database is a no-op.
import { db } from '../src/lib/db.js';

async function main() {
  const duplicates = await db.$queryRaw<{ jobId: string; attemptNumber: number; cnt: bigint }[]>`
    SELECT "jobId", "attemptNumber", COUNT(*) as cnt
    FROM "QCInspection"
    GROUP BY "jobId", "attemptNumber"
    HAVING COUNT(*) > 1
  `;

  if (duplicates.length === 0) {
    console.log('No duplicate (jobId, attemptNumber) pairs found. Safe to apply the unique constraint.');
    return;
  }

  console.log(`Found ${duplicates.length} duplicate (jobId, attemptNumber) group(s). Resolving...`);

  for (const dup of duplicates) {
    const rows = await db.qCInspection.findMany({
      where: { jobId: dup.jobId, attemptNumber: dup.attemptNumber },
      orderBy: { createdAt: 'asc' },
    });

    // Keep the earliest-created row as the canonical holder of this attempt number.
    const [, ...extras] = rows;
    const job = await db.job.findFirst({ where: { id: dup.jobId } });
    let nextAttempt = job ? job.qcAttemptCount : dup.attemptNumber;

    for (const extra of extras) {
      const hasProgress = extra.result !== 'Pending' || extra.checklist !== null;

      if (!hasProgress) {
        await db.jobPhoto.updateMany({ where: { qcInspectionId: extra.id }, data: { qcInspectionId: null } });
        await db.qCInspection.delete({ where: { id: extra.id } });
        console.log(`  Deleted orphaned duplicate inspection ${extra.id} (job ${dup.jobId}, attempt ${dup.attemptNumber})`);
      } else {
        nextAttempt += 1;
        await db.qCInspection.update({ where: { id: extra.id }, data: { attemptNumber: nextAttempt } });
        console.log(`  Renumbered inspection ${extra.id} (job ${dup.jobId}) from attempt ${dup.attemptNumber} to ${nextAttempt}`);
      }
    }

    if (job && nextAttempt > job.qcAttemptCount) {
      await db.job.update({ where: { id: dup.jobId }, data: { qcAttemptCount: nextAttempt } });
    }
  }

  console.log('Duplicate resolution complete.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FATAL ERROR resolving QCInspection duplicates:', err);
    process.exit(1);
  });
