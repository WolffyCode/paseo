import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import {
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  SearchQuery,
  search,
  setSearchQuery,
} from "@codemirror/search";
import {
  Annotation,
  Compartment,
  EditorState,
  type Extension,
  RangeSetBuilder,
} from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { themeModel } from "../../../theme/theme-model";
import { buildEditorTheme } from "../../theme/editor-theme.web";
import type { FileDocumentModel } from "../model/file-document-model";
import type { ConnectableEditorHandle } from "./editor-handle";
import { FindWidget } from "./find-widget";
import { collectSearchMatches } from "./search-decorations";

// The CodeMirror 6 editor surface — the ONE imperative (non-MobX) adapter, mounting a live EditorView
// into a web DOM node (desktop/web only). It only renders + emits events: user edits → doc.markEdited();
// blur/window-hide → doc.autosaveOnBlur(); the model never mirrors the buffer (it pulls via the handle on
// save). Theme, language, read-only, and search are CM compartments reconfigured from observable model +
// theme state through effects — read here in render so `observer` subscribes, applied imperatively so the
// view is created once and never rebuilt.

// Marks a transaction as an external content replacement (seed/reload/conflict) so its docChanged does
// NOT mark the document dirty — only genuine user edits do.
const EXTERNAL = Annotation.define<boolean>();

// Pick the CodeMirror language for a path (markdown edit mode included). Unknown extensions get no
// language (plain text), still themed + editable.
function languageExtension(path: string): Extension {
  const lower = path.toLowerCase();
  if (/\.(tsx|jsx)$/.test(lower))
    return javascript({ typescript: lower.endsWith("tsx"), jsx: true });
  if (/\.(ts|mts|cts)$/.test(lower)) return javascript({ typescript: true });
  if (/\.(js|mjs|cjs)$/.test(lower)) return javascript();
  if (lower.endsWith(".json")) return json();
  if (lower.endsWith(".css")) return css();
  if (/\.(html?|xhtml)$/.test(lower)) return html();
  if (/\.(py|pyi)$/.test(lower)) return python();
  if (/\.(md|markdown)$/.test(lower)) return markdown();
  return [];
}

// The soft-blue mark for every match + the amber mark for the current one; the class names match the
// theme's .cm-searchMatch / .cm-searchMatch-selected rules (editor-theme.web.ts).
const MATCH_MARK = Decoration.mark({ class: "cm-searchMatch" });
const CURRENT_MATCH_MARK = Decoration.mark({ class: "cm-searchMatch cm-searchMatch-selected" });

// A panel-independent search-match highlighter. CodeMirror's stock highlighter only paints while ITS
// own search panel is open — the file tab uses its own FindWidget and never opens that panel, so
// matches went undecorated. This plugin decorates the active query's matches (visible ranges only)
// with the same classes the theme styles, recomputed on doc / selection / viewport / query change.
const searchMatchHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildMatchDecorations(view);
    }
    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        getSearchQuery(update.state) !== getSearchQuery(update.startState)
      ) {
        this.decorations = buildMatchDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

// Build the match decoration set for the active query across the editor's visible ranges (off-screen
// matches cost nothing and are decorated as they scroll in).
function buildMatchDecorations(view: EditorView): DecorationSet {
  const query = getSearchQuery(view.state);
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (const match of collectSearchMatches(query, view.state, from, to)) {
      builder.add(match.from, match.to, match.selected ? CURRENT_MATCH_MARK : MATCH_MARK);
    }
  }
  return builder.finish();
}

// Count total matches for the active search query and which one (1-based) the selection sits on, so the
// find widget's "current/total" reflects what CM highlights. 0 current = no match is selected yet.
function countMatches(view: EditorView, query: SearchQuery): { current: number; total: number } {
  if (!query.valid) {
    return { current: 0, total: 0 };
  }
  const cursor = query.getCursor(view.state);
  const sel = view.state.selection.main;
  let total = 0;
  let current = 0;
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    total += 1;
    if (next.value.from === sel.from && next.value.to === sel.to) {
      current = total;
    }
  }
  return { current, total };
}

export const EditorSurface = observer(function EditorSurface({
  doc,
  editorHandle,
  frozen,
  onCursor,
}: {
  doc: FileDocumentModel;
  editorHandle: ConnectableEditorHandle;
  // Offline freeze: the panel is disconnected, so the buffer is shown read-only (no edits, no autosave).
  frozen: boolean;
  // Report the caret's 1-based line/column on every selection/doc change so the status bar can display it
  // (the editor owns the caret; the status bar only mirrors it — ui.html sRS4 "行 X, 列 Y").
  onCursor: (pos: { line: number; col: number }) => void;
}) {
  const hostRef = useRef<View>(null);
  const viewRef = useRef<EditorView | null>(null);
  const compartments = useRef({
    theme: new Compartment(),
    language: new Compartment(),
    editable: new Compartment(),
  });
  const [replaceText, setReplaceText] = useState("");
  // Latest-ref so the mount-once update listener reports through the current callback without re-subscribing.
  const onCursorRef = useRef(onCursor);
  onCursorRef.current = onCursor;

  // Reactive reads (subscribe `observer`): scheme drives the theme, read-only reason/freeze drive
  // editability, and the find session drives the CM search query.
  const scheme = themeModel.scheme;
  const readOnly = doc.readOnlyReason !== null || frozen;
  const { findOpen } = doc;
  const { query, matchCase, wholeWord, regex } = doc.find;

  // Mount once: build the view, connect the handle to it, wire edit + blur events. Cleanup destroys the
  // view and snapshots the buffer back into the handle (a trailing autosave after unmount still reads it).
  useEffect(() => {
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) {
      return;
    }
    const comp = compartments.current;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: "",
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          search({ literal: false }),
          searchMatchHighlighter,
          keymap.of([
            { key: "Mod-f", run: () => runIntent(() => doc.openFind()) },
            { key: "Mod-Alt-f", run: () => runIntent(() => doc.openReplace()) },
            {
              key: "Escape",
              run: () => (doc.findOpen ? runIntent(() => doc.closeFind()) : false),
            },
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          comp.theme.of(buildEditorTheme(themeModel.scheme)),
          comp.language.of(languageExtension(doc.path)),
          comp.editable.of(editableExtension(doc.readOnlyReason !== null || frozen)),
          EditorView.updateListener.of((update) => {
            reportEdit(update, doc);
            reportCursor(update, onCursorRef.current);
          }),
          EditorView.domEventHandlers({
            blur: () => {
              doc.autosaveOnBlur();
              return false;
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    editorHandle.connect({
      getContent: () => view.state.doc.toString(),
      applyExternalContent: (text) => {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          annotations: EXTERNAL.of(true),
        });
      },
    });
    return () => {
      editorHandle.disconnect();
      view.destroy();
      viewRef.current = null;
    };
    // Mount-once: doc/editorHandle/frozen are captured for the initial config; live changes are applied by
    // the reconfigure effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Window hide = a blur the DOM handler misses (focus stays in the doc). Route it to autosave too.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        doc.autosaveOnBlur();
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [doc]);

  // Reconfigure the theme when the chrome scheme flips.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.theme.reconfigure(buildEditorTheme(scheme)),
    });
  }, [scheme]);

  // Reconfigure editability when the read-only reason / freeze changes.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.current.editable.reconfigure(editableExtension(readOnly)),
    });
  }, [readOnly]);

  // Drive the CM search engine from the find session: set the query (highlighting all matches), jump to
  // the first match, and flow the resulting counts back into the model for the widget to render.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    const q = new SearchQuery({
      search: findOpen ? query : "",
      caseSensitive: matchCase,
      wholeWord,
      regexp: regex,
      replace: replaceText,
    });
    view.dispatch({ effects: setSearchQuery.of(q) });
    if (findOpen && q.valid) {
      findNext(view);
    }
    const { current, total } = countMatches(view, q);
    doc.setMatchCount(current, total);
  }, [findOpen, query, matchCase, wholeWord, regex, replaceText, doc]);

  // Match navigation + replace are CM operations (matching is the editor's job); each re-reports counts.
  const onNext = useCallback(() => runFindOp(viewRef.current, doc, findNext), [doc]);
  const onPrev = useCallback(() => runFindOp(viewRef.current, doc, findPrevious), [doc]);
  const onReplaceOne = useCallback(() => runFindOp(viewRef.current, doc, replaceNext), [doc]);
  const onReplaceAll = useCallback(() => runFindOp(viewRef.current, doc, replaceAll), [doc]);

  return (
    <View style={styles.root}>
      <View ref={hostRef} style={styles.host} />
      {findOpen ? (
        <FindWidget
          doc={doc}
          replaceText={replaceText}
          onReplaceText={setReplaceText}
          onNext={onNext}
          onPrev={onPrev}
          onReplaceOne={onReplaceOne}
          onReplaceAll={onReplaceAll}
        />
      ) : null}
    </View>
  );
});

// Mark the document dirty on a genuine user edit — skip transactions annotated EXTERNAL (seed/reload/
// conflict), which replace content without it being an edit.
function reportEdit(update: ViewUpdate, doc: FileDocumentModel): void {
  const external = update.transactions.some((tr) => tr.annotation(EXTERNAL));
  if (update.docChanged && !external) {
    doc.markEdited();
  }
}

// Report the caret's 1-based line/column to the status bar on any selection or document change. CM offsets
// are 0-based within a line; +1 makes column human-1-based to match the editor's line numbers / ui.html.
function reportCursor(
  update: ViewUpdate,
  onCursor: (pos: { line: number; col: number }) => void,
): void {
  if (!update.selectionSet && !update.docChanged) {
    return;
  }
  const head = update.state.selection.main.head;
  const line = update.state.doc.lineAt(head);
  onCursor({ line: line.number, col: head - line.from + 1 });
}

// Run a model find intent from a keymap binding; always report handled so CM stops default processing.
function runIntent(intent: () => void): boolean {
  intent();
  return true;
}

// The read-only / editable extension pair (empty when editable).
function editableExtension(readOnly: boolean): Extension {
  return readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [];
}

// Run a CM search command (next/prev/replace) then re-report the current/total counts to the model.
function runFindOp(
  view: EditorView | null,
  doc: FileDocumentModel,
  op: (view: EditorView) => void,
): void {
  if (!view) {
    return;
  }
  op(view);
  const { current, total } = countMatches(view, getActiveQuery(doc));
  doc.setMatchCount(current, total);
}

// Rebuild the active SearchQuery from the model's find session (the source of truth for query + options).
function getActiveQuery(doc: FileDocumentModel): SearchQuery {
  return new SearchQuery({
    search: doc.find.query,
    caseSensitive: doc.find.matchCase,
    wholeWord: doc.find.wholeWord,
    regexp: doc.find.regex,
  });
}

const styles = StyleSheet.create({
  root: { flex: 1, minWidth: 0, minHeight: 0, position: "relative" },
  host: { flex: 1, minWidth: 0, minHeight: 0 },
});
