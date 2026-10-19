/**
 * Chrome's zoom steps (components/zoom/page_zoom_constants.cc kPresetZoomFactors). Zoom in and
 * out move to the next step, from wherever the page is.
 */
const PRESET_ZOOM_FACTORS = [
  0.25,
  1 / 3,
  0.5,
  2 / 3,
  0.75,
  0.8,
  0.9,
  1,
  1.1,
  1.25,
  1.5,
  1.75,
  2,
  2.5,
  3,
  4,
  5,
] as const;

// Factors read back from Chromium carry float noise; closer than this counts as the same step.
const ZOOM_FACTOR_EPSILON = 0.001;

export const DEFAULT_ZOOM_FACTOR = 1;

/** The next preset step above (`1`) or below (`-1`) the current factor; stays put at the ends. */
export function nextZoomFactor(currentFactor: number, direction: 1 | -1): number {
  if (direction === 1) {
    const larger = PRESET_ZOOM_FACTORS.find(
      (factor) => factor > currentFactor + ZOOM_FACTOR_EPSILON,
    );
    return larger ?? currentFactor;
  }
  const smaller = PRESET_ZOOM_FACTORS.findLast(
    (factor) => factor < currentFactor - ZOOM_FACTOR_EPSILON,
  );
  return smaller ?? currentFactor;
}

/** The zoom as Chrome labels it: a whole percentage. */
export function zoomPercent(factor: number): number {
  return Math.round(factor * 100);
}
