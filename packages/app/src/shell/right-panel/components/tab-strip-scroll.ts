const WHEEL_LINE_PX = 16;

// Resolve mouse-wheel and trackpad deltas into horizontal pixels while preserving the dominant axis.
export function resolveTabStripWheelDelta({
  deltaX,
  deltaY,
  deltaMode,
  viewportWidth,
}: {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  viewportWidth: number;
}): number {
  const dominantDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
  if (deltaMode === 1) {
    return dominantDelta * WHEEL_LINE_PX;
  }
  if (deltaMode === 2) {
    return dominantDelta * viewportWidth;
  }
  return dominantDelta;
}
