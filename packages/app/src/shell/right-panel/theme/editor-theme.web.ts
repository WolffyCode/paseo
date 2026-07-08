import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import type { ThemeScheme } from "../../theme/theme-model";
import { EDITOR_TOKENS, editorSyntaxColors } from "./editor-tokens";

// Build the CodeMirror theme extensions for a chrome scheme: the editor chrome (EditorView.theme, from
// EDITOR_TOKENS) + the syntax coloring (HighlightStyle mapping @lezer/highlight tags to the "one" role
// palette). Web-only (imports CodeMirror DOM libs) — the editor surface is desktop/web-only, so this is
// never bundled on native. "Flat" = no italics anywhere (comments and emphasis stay upright), matching
// One Dark Pro Flat.

// Map the shared highlighter's role palette onto CodeMirror/@lezer tags. Grouped so every common token a
// Lezer grammar emits (js/ts/tsx, markdown, json, css, html, python) lands on a defined role color.
function buildHighlightStyle(scheme: ThemeScheme): HighlightStyle {
  const c = editorSyntaxColors(scheme);
  return HighlightStyle.define([
    {
      tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.moduleKeyword],
      color: c.keyword,
    },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: c.comment },
    { tag: [t.string, t.special(t.string), t.docString], color: c.string },
    { tag: t.regexp, color: c.regexp },
    { tag: [t.number, t.integer, t.float], color: c.number },
    { tag: [t.literal, t.bool, t.atom, t.null], color: c.literal },
    { tag: t.escape, color: c.escape },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.function },
    {
      tag: [t.definition(t.variableName), t.definition(t.function(t.variableName))],
      color: c.definition,
    },
    { tag: [t.className, t.namespace], color: c.class },
    { tag: [t.typeName, t.standard(t.typeName)], color: c.type },
    { tag: [t.tagName, t.angleBracket], color: c.tag },
    { tag: t.attributeName, color: c.attribute },
    { tag: [t.propertyName, t.attributeValue], color: c.property },
    { tag: [t.variableName, t.self, t.labelName], color: c.variable },
    {
      tag: [t.operator, t.derefOperator, t.compareOperator, t.arithmeticOperator, t.logicOperator],
      color: c.operator,
    },
    {
      tag: [t.punctuation, t.separator, t.bracket, t.brace, t.paren, t.squareBracket],
      color: c.punctuation,
    },
    { tag: [t.meta, t.processingInstruction, t.annotation], color: c.meta },
    {
      tag: [t.heading, t.heading1, t.heading2, t.heading3, t.heading4],
      color: c.heading,
      fontWeight: "600",
    },
    { tag: t.strong, color: c.number, fontWeight: "700" },
    { tag: t.emphasis, color: c.variable },
    { tag: [t.link, t.url], color: c.link, textDecoration: "underline" },
    { tag: t.invalid, color: c.variable },
  ]);
}

// The editor chrome theme (surface / gutter / current line / selection / cursor / search matches) mapped
// from EDITOR_TOKENS onto CodeMirror's DOM classes.
function buildChromeTheme(scheme: ThemeScheme): Extension {
  const tk = EDITOR_TOKENS[scheme];
  return EditorView.theme(
    {
      "&": { backgroundColor: tk.background, color: tk.foreground, height: "100%" },
      ".cm-scroller": {
        fontFamily:
          'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: "12px",
        lineHeight: "1.58",
      },
      ".cm-content": { caretColor: tk.cursor },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: tk.cursor, borderLeftWidth: "1.5px" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: tk.selection,
      },
      ".cm-gutters": {
        backgroundColor: tk.background,
        color: tk.lineNumber,
        border: "none",
      },
      ".cm-activeLine": { backgroundColor: tk.currentLine },
      ".cm-activeLineGutter": { backgroundColor: tk.currentLine, color: tk.currentLineNumber },
      ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "8px", paddingRight: "10px" },
      // Find matches: soft-blue for all, amber emphasis for the active one (ui.html .ematch / .ematch.cur).
      ".cm-searchMatch": { backgroundColor: tk.match, borderRadius: "2px" },
      ".cm-searchMatch-selected": {
        backgroundColor: tk.matchCurrent,
        boxShadow: `0 0 0 1px ${tk.matchCurrentBorder}`,
        borderRadius: "2px",
      },
    },
    { dark: scheme === "dark" },
  );
}

// The full theme extension set for a scheme, reconfigured when the chrome scheme flips.
export function buildEditorTheme(scheme: ThemeScheme): Extension[] {
  return [buildChromeTheme(scheme), syntaxHighlighting(buildHighlightStyle(scheme))];
}
