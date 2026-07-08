import { highlightCode } from "@getpaseo/highlight";
import { observer } from "mobx-react-lite";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Markdown, { MarkdownIt } from "react-native-markdown-display";
import { themeModel } from "../../../theme/theme-model";
import { editorSyntaxColors } from "../../theme/editor-tokens";
import type { ConnectableEditorHandle } from "./editor-handle";
import type { FileDocumentModel } from "../model/file-document-model";

// The Markdown preview surface (ui.html sRS5) — the read view a markdown tab opens to by default. Built
// on the shared react-native-markdown-display + markdown-it engine (NOT the legacy renderer), with code
// fences syntax-highlighted through @getpaseo/highlight so read + edit share one color source. The source
// is pulled from the editor buffer via the handle (the model never mirrors text), captured at mount —
// toggling to edit and back remounts this and re-reads the latest buffer. Colors follow the chrome theme.

// One shared markdown-it parser (typographer on, like the app's reader). No per-render cost.
const parser = MarkdownIt({ typographer: true });

export const MarkdownPreview = observer(function MarkdownPreview({
  doc,
  editorHandle,
}: {
  doc: FileDocumentModel;
  editorHandle: ConnectableEditorHandle;
}) {
  const tk = themeModel.tokens;
  const scheme = themeModel.scheme;
  // The markdown source lives in the editor buffer; capture it at mount (stable across theme repaints,
  // refreshed on the next preview⇄edit remount). doc.loadState is read so the observer re-runs once the
  // load action seeds the buffer.
  void doc.loadState;
  const [source] = useState(() => editorHandle.getContent());

  const mdStyles = useMemo(() => buildMarkdownStyles(tk), [tk]);
  const rules = useMemo(
    () => buildFenceRules(scheme, tk.surfaceSidebar, tk.border),
    [scheme, tk.surfaceSidebar, tk.border],
  );

  return (
    <ScrollView style={styles.body} contentContainerStyle={styles.content}>
      <Markdown style={mdStyles} rules={rules} markdownit={parser}>
        {source}
      </Markdown>
    </ScrollView>
  );
});

// The custom fence/code-block renderer: tokenize the code with the shared highlighter and paint each run
// with the "one" role palette, so fenced code reads like the editor. Falls back to plain mono text for
// languages the highlighter doesn't parse. The fence container style + the per-role token color styles
// are precomputed once per rules build (memoized on scheme/surface) so nothing new is allocated per row.
function buildFenceRules(scheme: "light" | "dark", surface: string, border: string) {
  const colorStyles = tokenColorStyles(scheme);
  const render = (node: { key: string; content: string; sourceInfo?: string }) => (
    <FenceBlock
      key={node.key}
      code={trimTrailingNewline(node.content)}
      lang={node.sourceInfo ?? ""}
      colorStyles={colorStyles}
      surface={surface}
      border={border}
    />
  );
  return { fence: render, code_block: render } as never;
}

// One fenced code block: a themed container over highlighted code lines. Each token is painted with its
// precomputed role-color style; keys are position-based (static, never-reordering highlighter output).
function FenceBlock({
  code,
  lang,
  colorStyles,
  surface,
  border,
}: {
  code: string;
  lang: string;
  colorStyles: Partial<Record<string, { color: string }>>;
  surface: string;
  border: string;
}) {
  const containerStyle = useMemo(
    () => [styles.fence, { backgroundColor: surface, borderColor: border }],
    [surface, border],
  );
  const lines = highlightCode(code, `code.${lang.trim().toLowerCase()}`);
  return (
    <View style={containerStyle}>
      <Text style={styles.fenceText}>
        {lines.map((tokens, lineIndex) => (
          // eslint-disable-next-line react/no-array-index-key -- static highlighter output never reorders
          <Text key={lineIndex}>
            {tokens.map((token, tokenIndex) => (
              // eslint-disable-next-line react/no-array-index-key -- static highlighter output never reorders
              <Text key={tokenIndex} style={token.style ? colorStyles[token.style] : undefined}>
                {token.text}
              </Text>
            ))}
            {lineIndex < lines.length - 1 ? "\n" : ""}
          </Text>
        ))}
      </Text>
    </View>
  );
}

// Precompute a role → { color } style for every highlight role, so token rendering references a stable
// style object instead of building one inline per token.
function tokenColorStyles(scheme: "light" | "dark"): Record<string, { color: string }> {
  const colors = editorSyntaxColors(scheme);
  const out: Record<string, { color: string }> = {};
  for (const [role, color] of Object.entries(colors)) {
    out[role] = { color };
  }
  return out;
}

// Drop the trailing newline markdown-it appends to fence content.
function trimTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content.slice(0, -1) : content;
}

// The themed element styles handed to <Markdown> (mirrors ui.html .md-body typography onto the chrome
// token palette). Typed as the library's loose style record.
function buildMarkdownStyles(tk: (typeof themeModel)["tokens"]) {
  return {
    body: { color: tk.foreground, fontSize: 13, lineHeight: 21 },
    heading1: {
      color: tk.foreground,
      fontSize: 19,
      fontWeight: "600",
      marginBottom: 10,
      paddingBottom: 6,
      borderBottomWidth: 1,
      borderColor: tk.border,
    },
    heading2: {
      color: tk.foreground,
      fontSize: 15,
      fontWeight: "600",
      marginTop: 15,
      marginBottom: 7,
    },
    heading3: {
      color: tk.foreground,
      fontSize: 14,
      fontWeight: "600",
      marginTop: 12,
      marginBottom: 6,
    },
    paragraph: { color: tk.foregroundMuted, marginTop: 0, marginBottom: 9 },
    bullet_list: { marginBottom: 9 },
    ordered_list: { marginBottom: 9 },
    list_item: { color: tk.foregroundMuted, marginBottom: 3 },
    link: { color: tk.accent },
    blockquote: {
      borderColor: tk.border,
      borderLeftWidth: 3,
      paddingLeft: 12,
      color: tk.foregroundMuted,
      marginBottom: 9,
    },
    code_inline: {
      fontFamily: "SFMono-Regular",
      fontSize: 12,
      backgroundColor: tk.toggleActive,
      color: tk.foreground,
      borderRadius: 4,
    },
    hr: { backgroundColor: tk.border },
  } as never;
}

const styles = StyleSheet.create({
  body: { flex: 1, minHeight: 0 },
  content: { padding: 18 },
  fence: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 9,
  },
  fenceText: { fontFamily: "SFMono-Regular", fontSize: 12, lineHeight: 18 },
});
