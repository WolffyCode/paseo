/**
 * How WebUI pages search their own text (cr_search_field_mixin and search_highlight_utils): a
 * plain-text match that ignores case and accents.
 */

const MAX_QUERY_LENGTH = 1000;
// CrSearchFieldMixin: 500 ms after one character, 100 less per character up to four.
const LONGEST_DEBOUNCE_MS = 500;
const DEBOUNCE_STEP_MS = 100;
const DEBOUNCE_STEPS = 4;
const COMBINING_MARKS = /[̀-ͯ]/g;

/** The query as the field hands it on: whitespace runs as one space, without leading space. */
export function normalizeSearchQuery(raw: string): string {
  return raw.replace(/\s+/g, " ").replace(/^ /, "").slice(0, MAX_QUERY_LENGTH);
}

/** How long the field waits after typing before it searches. */
export function searchDebounceMs(query: string): number {
  if (query === "") {
    return 0;
  }
  return LONGEST_DEBOUNCE_MS - DEBOUNCE_STEP_MS * (Math.min(query.length, DEBOUNCE_STEPS) - 1);
}

/** One character without accents, lower-cased; it can come out longer or empty. */
function foldCharacter(character: string): string {
  return character.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
}

/** The folded text, and for each of its characters the original character it came from. */
function foldText(text: string): { folded: string; sourceIndexes: number[] } {
  let folded = "";
  const sourceIndexes: number[] = [];
  let index = 0;
  for (const character of text) {
    const foldedCharacter = foldCharacter(character);
    folded += foldedCharacter;
    for (let i = 0; i < foldedCharacter.length; i += 1) sourceIndexes.push(index);
    index += character.length;
  }
  return { folded, sourceIndexes };
}

function foldQuery(query: string): string {
  return [...query].map(foldCharacter).join("");
}

export function textsMatchSearch(texts: readonly string[], query: string): boolean {
  const foldedQuery = foldQuery(query);
  if (foldedQuery === "") {
    return false;
  }
  return texts.some((text) => foldText(text).folded.includes(foldedQuery));
}

export interface HighlightPart {
  text: string;
  isHit: boolean;
}

/** The text split into the stretches a search highlights and the rest, in order. */
export function highlightParts(text: string, query: string): HighlightPart[] {
  const foldedQuery = foldQuery(query);
  if (foldedQuery === "") {
    return [{ text, isHit: false }];
  }
  const { folded, sourceIndexes } = foldText(text);
  const parts: HighlightPart[] = [];
  let sourceCursor = 0;
  let searchFrom = 0;
  for (;;) {
    const hitStart = folded.indexOf(foldedQuery, searchFrom);
    if (hitStart < 0) break;
    const hitEnd = hitStart + foldedQuery.length;
    const sourceStart = sourceIndexes[hitStart] ?? text.length;
    const lastSource = sourceIndexes[hitEnd - 1] ?? text.length - 1;
    const sourceEnd = lastSource + ((text.codePointAt(lastSource) ?? 0) > 0xffff ? 2 : 1);
    if (sourceStart > sourceCursor) {
      parts.push({ text: text.slice(sourceCursor, sourceStart), isHit: false });
    }
    parts.push({ text: text.slice(sourceStart, sourceEnd), isHit: true });
    sourceCursor = sourceEnd;
    searchFrom = hitEnd;
  }
  if (sourceCursor < text.length || parts.length === 0) {
    parts.push({ text: text.slice(sourceCursor), isHit: false });
  }
  return parts;
}
