// The drag-reorder landing rule: remove the moving tab, then re-insert it at the drop index among the
// remaining tabs. No fixed first slot (any tab can go anywhere); the drop index is clamped to the
// valid range so a drag past either edge lands at that edge instead of overshooting.

// Compute the new tab-id order after dropping `movingId` at `dropIndex`. An unknown id leaves the
// order unchanged (defensive — a real drag always moves an existing tab).
export function placeTabAtDropIndex(
  order: ReadonlyArray<string>,
  movingId: string,
  dropIndex: number,
): string[] {
  if (!order.includes(movingId)) {
    return [...order];
  }
  const rest = order.filter((id) => id !== movingId);
  const target = Math.max(0, Math.min(dropIndex, rest.length));
  return [...rest.slice(0, target), movingId, ...rest.slice(target)];
}
