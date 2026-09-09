// INV-01A/INV-02 — pure logic extracted from InventoryService.getMovements()'s
// franchise-scope fix, so the scoping decision itself is testable without a
// live database (the actual "which item ids belong to this franchise"
// lookup still needs a real query — that part is left in the service).
//
// INV-02: InventoryMovement now carries its own franchiseId, populated on
// every new write (DISPATCH tagged with the *destination* franchise, all
// other types tagged with the affected item's own franchiseId). Historical
// rows written before this column existed remain franchiseId: null, so
// scope is resolved as "explicitly tagged as mine" OR "untagged legacy row
// whose item currently belongs to my franchise" (the original itemId-join
// fallback, kept permanently for those rows since they can never be
// backfilled with certainty).
export interface MovementScopeResult {
  // Reserved for a future "no query needed" short-circuit. Always false
  // today: because a movement can now be explicitly tagged to a franchise
  // even when its itemId belongs to a different Inventory row (e.g. a
  // DISPATCH against the HQ item, tagged to the receiving franchise), an
  // itemId outside the actor's own current items can no longer be proven
  // unreachable without querying.
  empty: boolean;
  where: Record<string, unknown>;
}

export function resolveMovementScope(
  userRole: string,
  userFranchiseId: string | null | undefined,
  itemId: string | undefined,
  scopedItemIds: string[]
): MovementScopeResult {
  const isUnrestricted = userRole === 'SUPER_ADMIN' || userRole === 'HQ_USER';
  if (isUnrestricted || !userFranchiseId) {
    return { empty: false, where: itemId ? { itemId } : {} };
  }

  const scopeCondition = {
    OR: [
      { franchiseId: userFranchiseId },
      { franchiseId: null, itemId: { in: scopedItemIds } },
    ],
  };

  return {
    empty: false,
    where: itemId ? { itemId, ...scopeCondition } : scopeCondition,
  };
}
