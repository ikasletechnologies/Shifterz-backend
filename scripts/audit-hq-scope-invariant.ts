// Read-only audit — Phase 1 pre-flight. Reports, does not modify.
// Finds employees where role is a non-HQ role but the record already
// carries HQ-wide data-scope characteristics (franchiseId null and/or
// hqControlled true) — the exact invariant violation the escalation
// path (fixed in Patch A) could have produced before today.
import { db } from '../src/lib/db.js';

const NON_HQ_ROLES = [
  'TECHNICIAN',
  'SERVICE_ADVISOR',
  'BILLING_EXECUTIVE',
  'RECEPTION_EXECUTIVE',
  'QUALITY_INSPECTOR',
  'INVENTORY_EXECUTIVE',
  'BRANCH_MANAGER',
  'FRANCHISE_ADMIN',
];

async function main() {
  const anomalies = await db.employee.findMany({
    where: {
      role: { in: NON_HQ_ROLES },
      isDeleted: false,
      OR: [{ franchiseId: null }, { hqControlled: true }],
    },
    select: { id: true, name: true, role: true, franchiseId: true, hqControlled: true, status: true, createdAt: true },
  });

  console.log(`ANOMALY_COUNT=${anomalies.length}`);
  console.log(JSON.stringify(anomalies, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.log('AUDIT_QUERY_FAILED:', String(e.message || e).split('\n')[0]);
  process.exit(0);
});
