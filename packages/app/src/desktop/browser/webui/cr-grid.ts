export type CrGridArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export function isCrGridArrowKey(key: string): key is CrGridArrowKey {
  return key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
}

/**
 * The item an arrow key moves to in a cr-grid of `count` items laid out in `columns` columns
 * (cr_grid.ts onKeydown_, left to right): ← and → step and wrap at the ends, ↑ and ↓ move a row
 * and wrap to the other end of the column, around a short last row.
 */
export function crGridNextIndex(input: {
  count: number;
  columns: number;
  index: number;
  key: CrGridArrowKey;
}): number {
  const { count, columns, index, key } = input;
  const bottomRowColumns = count % columns;
  const direction = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
  const isInEdgeRow = direction === 1 ? index >= count - bottomRowColumns : index < columns;
  let delta = direction;
  if (key === "ArrowUp" || key === "ArrowDown") {
    delta = direction * (isInEdgeRow ? bottomRowColumns : columns);
  }
  if (key === "ArrowUp" && isInEdgeRow && index >= bottomRowColumns) {
    delta -= columns;
  } else if (key === "ArrowDown" && !isInEdgeRow && index + delta >= count) {
    delta += bottomRowColumns;
  }
  return (count + index + delta) % count;
}
