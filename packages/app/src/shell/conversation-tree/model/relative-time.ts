/** Format an optional ISO timestamp with deterministic minute, hour, and day buckets. */
export function formatRelative(iso: string | null, nowMs: number): string {
  if (iso === null) {
    return "暂无最近变更";
  }
  const timestampMs = Date.parse(iso);
  if (!Number.isFinite(timestampMs)) {
    return iso;
  }
  const elapsedMs = Math.max(0, nowMs - timestampMs);
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) {
    return "刚刚";
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }
  return `${Math.floor(hours / 24)} 天前`;
}
