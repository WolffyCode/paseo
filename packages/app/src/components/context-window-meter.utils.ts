export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${Math.round(value / 1_000_000)}m`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}k`;
  }
  return Math.round(value).toString();
}

export interface ResolvedContextUsage {
  maxTokens: number;
  usedTokens: number;
  percentage: number;
}

/** Resolve a complete context snapshot so partial or invalid usage never reaches the meter UI. */
export function resolveContextUsage(
  maxTokens: number | null,
  usedTokens: number | null,
): ResolvedContextUsage | null {
  if (
    maxTokens === null ||
    usedTokens === null ||
    !Number.isFinite(maxTokens) ||
    !Number.isFinite(usedTokens) ||
    maxTokens <= 0 ||
    usedTokens < 0
  ) {
    return null;
  }
  return { maxTokens, usedTokens, percentage: (usedTokens / maxTokens) * 100 };
}

/** Keep the desktop runtime entry stable even before usage arrives, while preserving mobile omission. */
export function shouldShowContextPlaceholder(input: {
  pending: boolean;
  showUnavailable: boolean;
}): boolean {
  return input.pending || input.showUnavailable;
}
