/** Deterministic HSL background for a vendor's initial-letter icon, derived from
 *  its name. Shared so the providers page and the vendor modals stay in sync. */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 38%)`;
}
