// classifyDocumentKind decides how a read file renders in the file tab. Rewritten equivalently from the
// legacy @/components/file-pane-render-mode (no cross-directory import): markdown is the shell's OWN
// extension check (so it never depends on the highlighter, which also parses .md); code uses the shared
// highlight language support; image/binary come from the host's own read classification.

import { isLanguageSupported } from "@getpaseo/highlight";
import type { FileReadResult } from "@getpaseo/client/internal/daemon-client";

export type DocumentKind = "code" | "text" | "markdown" | "image" | "binary";

// The read signals classify consumes. `readKind` is the host's own image/text/binary decision (it
// already folded mime host-side), so there is no separate mime axis here — one truth source.
export interface DocumentKindInput {
  path: string;
  readKind: FileReadResult["kind"];
}

// Classify by priority: markdown extension first (a .md is read as text host-side, so the extension must
// win before the code/text fallbacks), then host image/binary, then highlighter-supported code, else
// plain text.
export function classifyDocumentKind(input: DocumentKindInput): DocumentKind {
  if (isMarkdownPath(input.path)) {
    return "markdown";
  }
  if (input.readKind === "image") {
    return "image";
  }
  if (input.readKind === "binary") {
    return "binary";
  }
  if (isLanguageSupported(input.path)) {
    return "code";
  }
  return "text";
}

// Markdown by extension, case-insensitive. Exact .md / .markdown suffixes only, so .mdx and .md.txt are
// naturally excluded (equivalent to the legacy isRenderedMarkdownFile).
function isMarkdownPath(path: string): boolean {
  const lower = path.trim().toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}
