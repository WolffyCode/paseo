// Derive the short language label shown in the file tab's status bar, purely from the path's extension
// (mirroring the editor's own language pick, but as a display token). Encoding is always UTF-8 (we
// decode/encode UTF-8) and the line ending defaults to LF this round, so those are rendered as literals
// by the status bar; the cursor row/column is NOT shown because the editor owns the cursor and does not
// report it to the model (nothing to derive it from).

// Map a file path to its status-bar language token, uppercased from the extension. Unknown extensions
// fall back to "TEXT" (plain text, still editable).
export function languageLabel(path: string): string {
  const lower = path.trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot === -1 || dot === lower.length - 1) {
    return "TEXT";
  }
  const ext = lower.slice(dot + 1);
  return EXT_LABEL[ext] ?? ext.toUpperCase();
}

// The extensions worth a curated label; everything else uses its uppercased extension.
const EXT_LABEL: Record<string, string> = {
  ts: "TS",
  mts: "TS",
  cts: "TS",
  tsx: "TSX",
  js: "JS",
  mjs: "JS",
  cjs: "JS",
  jsx: "JSX",
  json: "JSON",
  css: "CSS",
  html: "HTML",
  htm: "HTML",
  py: "PY",
  pyi: "PY",
  md: "MD",
  markdown: "MD",
  txt: "TEXT",
};
