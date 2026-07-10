import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useWebScrollViewScrollbar } from "@/components/use-web-scrollbar";
import { ChevronDown, Search, X } from "lucide-react-native";
import { SvgXml } from "react-native-svg";
import { isWeb } from "@/constants/platform";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { themeModel } from "../../theme/theme-model";
import { getFileIconSvg } from "../icons/material-file-icons";
import type { FileTreeStore } from "../model/file-tree-store";
import { computeHighlightRanges, searchErrorCopy } from "../model/search-state";
import type { SearchMatch } from "../model/types";
import { ROW_HOVER_DATASET } from "../util/row-hover-css";
import { lastSegment, parentDirPrefix } from "../util/tree-paths";
import { FT_BLUE } from "./tokens";

// The search bar (observer): one input row = a leading name/content mode DROPDOWN, the query field, a
// clear button, and a trailing search icon; then a result-count line and a flat result list with hit
// highlighting (or a skeleton while searching) — sFT4/sFT5. Pure view — it renders the store's search
// state + searchResultsView and dispatches setQuery / setSearchMode / clearSearch /
// activateSearchResult; ranges come from the tested computeHighlightRanges pure function.

const SKELETON_WIDTHS = [120, 90, 140] as const;

// Web-only: kill the browser's default focus outline on the query field (it paints in the OS accent —
// green on some machines — which clashes with the theme). The focus cue is the input box's own border
// turning theme-blue instead. Ignored on native.
const WEB_INPUT_STYLE = (isWeb ? { outlineStyle: "none" } : null) as object | null;

export const TreeSearch = observer(function TreeSearch({ store }: { store: FileTreeStore }) {
  const tk = themeModel.tokens;
  const { mode, query, phase } = store.search;
  const inputRef = useRef<TextInput | null>(null);
  const [focused, setFocused] = useState(false);
  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);

  // Focus the input when the search bar mounts (the toolbar just opened it). Deferred one frame so
  // the focus steal never lands mid-press on the toolbar button — focusing synchronously during the
  // opening click's down/up window can cancel the button's release on web (the old "click twice to
  // open" report). On web, preventScroll stops the browser from scrollIntoView-ing the focused
  // input — that auto-scroll is what dragged the overflow-hidden card sideways when a row ever ran
  // wider than the panel (belt to the minWidth:0 suspenders on the input itself).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (isWeb) {
        const node = inputRef.current as unknown as {
          focus?: (options?: { preventScroll?: boolean }) => void;
        } | null;
        node?.focus?.({ preventScroll: true });
        return;
      }
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const onChangeText = useCallback((text: string) => store.setQuery(text), [store]);
  const onClear = useCallback(() => store.clearSearch(), [store]);
  // Deliberately NO Escape handling here: Esc used to close the whole search panel, which threw
  // users out of an active search by accident (chairman decision 2026-07-07 — removed). The panel
  // closes only via the toolbar search toggle; Esc still closes menus/inline editors elsewhere.
  const onModeName = useCallback(() => store.setSearchMode("name"), [store]);
  const onModeContent = useCallback(() => store.setSearchMode("content"), [store]);
  const onBlankContextMenu = useCallback(
    (event: SearchResultContextMenuEvent) => {
      if (phase !== "results" && phase !== "empty") {
        return;
      }
      event.preventDefault?.();
      const point = event.nativeEvent;
      store.openContextMenu({ kind: "blank" }, { x: point?.pageX ?? 0, y: point?.pageY ?? 0 });
    },
    [phase, store],
  );

  const headerStyle = useMemo(() => [styles.header, { borderBottomColor: tk.border }], [tk.border]);
  // Focus cue: the box border turns theme-blue when the field is focused (replaces the UA outline).
  const inputBoxStyle = useMemo(
    () => [styles.input, { borderColor: focused ? FT_BLUE : tk.border }],
    [focused, tk.border],
  );
  const inputTextStyle = useMemo(
    () => [styles.inputText, { color: tk.foreground }, WEB_INPUT_STYLE],
    [tk.foreground],
  );
  const modeBtnTextStyle = useMemo(
    () => [styles.modeBtnText, { color: tk.foreground }],
    [tk.foreground],
  );
  const dividerStyle = useMemo(
    () => [styles.modeDivider, { backgroundColor: tk.border }],
    [tk.border],
  );
  const modeLabel = mode === "name" ? "文件名" : "内容";

  // Only fill the panel while a search is active (results / searching / empty / error). When idle (bar
  // open but no query) the bar is just its header so the tree below keeps the full height from the top —
  // otherwise an empty flex body would shove the tree down and leave a blank gap above it.
  const active = phase !== "idle";

  return (
    <View style={active ? styles.wrap : undefined}>
      <View style={headerStyle}>
        <View style={inputBoxStyle}>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <View style={styles.modeBtn}>
                <Text style={modeBtnTextStyle}>{modeLabel}</Text>
                <ChevronDown size={12} color={tk.foregroundMuted} />
              </View>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" width={150}>
              <DropdownMenuItem onSelect={onModeName} selected={mode === "name"} showSelectedCheck>
                文件名
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={onModeContent}
                selected={mode === "content"}
                showSelectedCheck
              >
                内容
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <View style={dividerStyle} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={onChangeText}
            onFocus={onFocus}
            onBlur={onBlur}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            style={inputTextStyle}
          />
          {query.length > 0 ? (
            <Pressable
              onPress={onClear}
              style={styles.clear}
              accessibilityLabel="清空搜索"
              testID="file-tree-search-clear"
            >
              <X size={14} color={tk.foregroundMuted} />
            </Pressable>
          ) : null}
          <Search size={16} color={tk.foregroundMuted} />
        </View>
        {/* The count line renders ONLY while a search is active — when idle it used to reserve an
            empty strip between the input and the tree that read as a detached band (gate-3). */}
        {active ? (
          <View style={styles.countRow}>
            <SearchCount store={store} />
          </View>
        ) : null}
      </View>

      <Pressable
        style={styles.bodyArea}
        // @ts-expect-error onContextMenu is web-only and absent from RN's Pressable types.
        onContextMenu={onBlankContextMenu}
      >
        {phase === "searching" ? <SearchSkeleton color={tk.toggleActive} /> : null}
        {phase === "empty" ? <NoMatchState /> : null}
        {phase === "error" ? (
          <SearchErrorState mode={mode} kind={store.search.errorKind ?? "failed"} />
        ) : null}
        {phase === "results" ? <ResultList store={store} mode={mode} query={query} /> : null}
      </Pressable>
    </View>
  );
});

// The flat list of search results, name rows or content rows by mode. Thin themed overlay
// scrollbar on web (the native web scrollbar is a fat gutter — gate-3).
const ResultList = observer(function ResultList({
  store,
  mode,
  query,
}: {
  store: FileTreeStore;
  mode: "name" | "content";
  query: string;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const scrollbar = useWebScrollViewScrollbar(scrollRef);
  return (
    <View style={styles.resultsWrap}>
      <ScrollView
        ref={scrollRef}
        style={styles.results}
        keyboardShouldPersistTaps="handled"
        onLayout={scrollbar.onLayout}
        onScroll={scrollbar.onScroll}
        onContentSizeChange={scrollbar.onContentSizeChange}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {store.searchResultsView.map((match, index) =>
          mode === "content" ? (
            <ContentResult
              key={`${match.path}:${match.line ?? index}`}
              match={match}
              query={query}
              store={store}
            />
          ) : (
            <NameResult key={match.path} match={match} query={query} store={store} />
          ),
        )}
      </ScrollView>
      {scrollbar.overlay}
    </View>
  );
});

// The result-count line: "N 个结果" (name), "N 处 · M 文件" (content), or "搜索中…" while searching.
// With progressive delivery the phase flips to results on the first streamed batch — the trailing
// "· 搜索中…" suffix stays until the scan's final (complete) response settles.
const SearchCount = observer(function SearchCount({ store }: { store: FileTreeStore }) {
  const tk = themeModel.tokens;
  const { mode, phase } = store.search;
  const countStyle = useMemo(
    () => [styles.count, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  if (phase === "searching") {
    return <Text style={countStyle}>搜索中…</Text>;
  }
  if (phase !== "results") {
    return <View style={styles.count} />;
  }
  const streamingSuffix = store.searchInFlight ? " · 搜索中…" : "";
  const results = store.searchResultsView;
  if (mode === "content") {
    const files = new Set(results.map((r) => r.path)).size;
    return (
      <Text style={countStyle}>
        <Text style={styles.countNum}>{results.length}</Text> 处 · {files} 文件
        {streamingSuffix}
      </Text>
    );
  }
  return (
    <Text style={countStyle}>
      <Text style={styles.countNum}>{results.length}</Text> 个结果
      {streamingSuffix}
    </Text>
  );
});

// One name-search result: file-type icon + highlighted file name; activation is delegated to the store.
const NameResult = observer(function NameResult({
  match,
  query,
  store,
}: {
  match: SearchMatch;
  query: string;
  store: FileTreeStore;
}) {
  const tk = themeModel.tokens;
  const onPress = useCallback(() => store.activateSearchResult(match), [store, match]);
  const onContextMenu = useCallback(
    (event: SearchResultContextMenuEvent) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      const point = event.nativeEvent;
      store.openContextMenu(
        { kind: match.kind === "directory" ? "dir" : "file", path: match.path },
        { x: point?.pageX ?? 0, y: point?.pageY ?? 0 },
      );
    },
    [store, match.kind, match.path],
  );
  const isContextTarget = store.contextMenu?.target.path === match.path;
  const name = lastSegment(match.path);
  const rowStyle = useMemo(
    () => [styles.nameRow, isContextTarget ? { backgroundColor: tk.toggleActive } : null],
    [isContextTarget, tk.toggleActive],
  );
  const textStyle = useMemo(() => [styles.nameText, { color: tk.foreground }], [tk.foreground]);
  return (
    <Pressable
      onPress={onPress}
      // Single hover path: the web CSS :hover rule (util/row-hover-css.ts); the context-menu
      // target drops the attribute so its selected fill is never contested.
      dataSet={isContextTarget ? undefined : ROW_HOVER_DATASET}
      // @ts-expect-error onContextMenu is web-only and absent from RN's Pressable types.
      onContextMenu={onContextMenu}
      style={rowStyle}
    >
      <View style={styles.icon}>
        <SvgXml xml={getFileIconSvg(name)} width={16} height={16} />
      </View>
      <Text numberOfLines={1} style={textStyle}>
        <Highlighted text={name} query={query} baseColor={tk.foreground} />
      </Text>
    </Pressable>
  );
});

// One content-search result: file name + grey relative dir, then the matched line (line number + the
// preview with the query highlighted). Activation carries that line through the store to the editor.
const ContentResult = observer(function ContentResult({
  match,
  query,
  store,
}: {
  match: SearchMatch;
  query: string;
  store: FileTreeStore;
}) {
  const tk = themeModel.tokens;
  const onPress = useCallback(() => store.activateSearchResult(match), [store, match]);
  const onContextMenu = useCallback(
    (event: SearchResultContextMenuEvent) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      const point = event.nativeEvent;
      store.openContextMenu(
        { kind: match.kind === "directory" ? "dir" : "file", path: match.path },
        { x: point?.pageX ?? 0, y: point?.pageY ?? 0 },
      );
    },
    [store, match.kind, match.path],
  );
  const isContextTarget = store.contextMenu?.target.path === match.path;
  const name = lastSegment(match.path);
  const rowStyle = useMemo(
    () => [styles.contentRow, isContextTarget ? { backgroundColor: tk.toggleActive } : null],
    [isContextTarget, tk.toggleActive],
  );
  const nameStyle = useMemo(() => [styles.contentName, { color: tk.foreground }], [tk.foreground]);
  const pathStyle = useMemo(
    () => [styles.contentPath, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  const lineStyle = useMemo(
    () => [styles.contentLine, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  return (
    <Pressable
      onPress={onPress}
      // Single hover path: the web CSS :hover rule (util/row-hover-css.ts).
      dataSet={isContextTarget ? undefined : ROW_HOVER_DATASET}
      // @ts-expect-error onContextMenu is web-only and absent from RN's Pressable types.
      onContextMenu={onContextMenu}
      style={rowStyle}
    >
      <View style={styles.contentHead}>
        <View style={styles.icon}>
          <SvgXml xml={getFileIconSvg(name)} width={16} height={16} />
        </View>
        <Text numberOfLines={1} style={nameStyle}>
          {name}
        </Text>
        <Text numberOfLines={1} style={pathStyle}>
          {parentDirPrefix(match.path)}
        </Text>
      </View>
      {match.preview ? (
        <Text numberOfLines={1} style={lineStyle}>
          {match.line !== undefined ? <Text style={styles.lineNo}>{`L${match.line} `}</Text> : null}
          <Highlighted
            text={match.preview}
            query={query}
            ranges={match.ranges}
            baseColor={tk.foregroundMuted}
          />
        </Text>
      ) : null}
    </Pressable>
  );
});

interface SearchResultContextMenuEvent {
  nativeEvent?: { pageX?: number; pageY?: number };
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

// Render text with the query's match ranges highlighted in blue. Used by both name results and content
// previews (genuine reuse), so the range→segment split lives here once. Server ranges win when given.
// Segments are keyed by their start offset (stable + unique within a string).
function Highlighted({
  text,
  query,
  ranges,
  baseColor,
}: {
  text: string;
  query: string;
  ranges?: ReadonlyArray<{ start: number; end: number }>;
  baseColor: string;
}) {
  const baseStyle = useMemo(() => ({ color: baseColor }), [baseColor]);
  const hits = ranges ?? computeHighlightRanges(text, query);
  if (hits.length === 0) {
    return <Text style={baseStyle}>{text}</Text>;
  }
  const segments: Array<{ key: number; text: string; hit: boolean }> = [];
  let cursor = 0;
  for (const range of hits) {
    if (range.start > cursor) {
      segments.push({ key: cursor, text: text.slice(cursor, range.start), hit: false });
    }
    segments.push({ key: range.start, text: text.slice(range.start, range.end), hit: true });
    cursor = range.end;
  }
  if (cursor < text.length) {
    segments.push({ key: cursor, text: text.slice(cursor), hit: false });
  }
  return (
    <>
      {segments.map((segment) =>
        segment.hit ? (
          <Text key={segment.key} style={styles.hit}>
            {segment.text}
          </Text>
        ) : (
          <Text key={segment.key} style={baseStyle}>
            {segment.text}
          </Text>
        ),
      )}
    </>
  );
}

// The searching skeleton: a few shimmer placeholder rows in the result area (sFT4/sFT5 "搜索中").
function SearchSkeleton({ color }: { color: string }) {
  return (
    <View style={styles.results}>
      {SKELETON_WIDTHS.map((width) => (
        <SkeletonRow key={width} width={width} color={color} />
      ))}
    </View>
  );
}

// One shimmer skeleton row in the search result area.
function SkeletonRow({ width, color }: { width: number; color: string }) {
  const iconStyle = useMemo(() => [styles.skIcon, { backgroundColor: color }], [color]);
  const textStyle = useMemo(
    () => [styles.skText, { width, backgroundColor: color }],
    [width, color],
  );
  return (
    <View style={styles.skRow}>
      <View style={iconStyle} />
      <View style={textStyle} />
    </View>
  );
}

// The search-no-match state (sFT6): distinct from an empty directory — the root has content, the query
// just matched nothing. No action button; the user changes the query or switches mode.
function NoMatchState() {
  const tk = themeModel.tokens;
  const titleStyle = useMemo(
    () => [styles.noMatchTitle, { color: tk.foreground }],
    [tk.foreground],
  );
  const subStyle = useMemo(
    () => [styles.noMatchSub, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  return (
    <View style={styles.noMatch}>
      <Search size={22} color={tk.foregroundMuted} />
      <Text style={titleStyle}>无匹配结果</Text>
      <Text style={subStyle}>换关键字，或切换名/内容范围。</Text>
    </View>
  );
}

// The search error state, split by cause: "unsupported" = the host lacks the fsSearch capability
// (upgrade prompt, no degraded fan-out); "failed" = this run broke (timeout / disconnect / host
// error — retry prompt). Conflating the two showed "upgrade your host" for plain timeouts.
function SearchErrorState({
  mode,
  kind,
}: {
  mode: "name" | "content";
  kind: "unsupported" | "failed";
}) {
  const tk = themeModel.tokens;
  const titleStyle = useMemo(
    () => [styles.noMatchTitle, { color: tk.foreground }],
    [tk.foreground],
  );
  const subStyle = useMemo(
    () => [styles.noMatchSub, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  const { title, sub } = searchErrorCopy(mode, kind);
  return (
    <View style={styles.noMatch}>
      <Search size={22} color={tk.foregroundMuted} />
      <Text style={titleStyle}>{title}</Text>
      <Text style={subStyle}>{sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // The search section fills the panel (so the result / skeleton / empty area below the fixed header
  // takes the remaining height instead of collapsing to its content height).
  wrap: { flex: 1, minHeight: 0 },
  // paddingHorizontal 10 lines the input box's left border up with the toolbar's root label (bar
  // 6 + root 4) and the tree rows' content (body 4 + row 6) — at the old 6 the bordered box sat
  // ~4px left of everything around it and read as misaligned (chairman gate-3).
  header: { paddingVertical: 6, paddingHorizontal: 10, gap: 6, borderBottomWidth: 1 },
  bodyArea: { flex: 1, minHeight: 0 },
  input: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 30,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 6,
  },
  // minWidth 0 is load-bearing: a web <input> has an intrinsic min width (~170px) and refuses to
  // shrink below it, so at the panel's 220px minimum the row overflowed 12px and the autofocus
  // scrollIntoView h-scrolled the whole card 12px left (the chairman's "UI 超出" — only visible
  // at min panel width, which default-width testing never hits).
  inputText: { flex: 1, minWidth: 0, fontSize: 13, padding: 0 },
  // The clear × press target: REAL padding grows the 14px icon to a ~26px target inside the 30px
  // input row (negative horizontal margins keep the row's visual gaps). RN-web ignores hitSlop for
  // mouse clicks, so the padding has to be real.
  clear: { padding: 6, marginHorizontal: -4 },
  // The leading mode dropdown trigger inside the input box: compact "文件名 ▾". Real vertical
  // padding grows the ~16px text row to a ~28px target (same RN-web hitSlop caveat as above).
  modeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginVertical: -6,
  },
  modeBtnText: { fontSize: 12, fontWeight: "600" },
  // Thin vertical divider separating the mode dropdown from the query field.
  modeDivider: { width: 1, height: 16 },
  countRow: { flexDirection: "row", alignItems: "center", minHeight: 14 },
  count: { marginLeft: "auto", fontSize: 11 },
  countNum: { color: FT_BLUE, fontWeight: "700" },
  // Wrapper so the web overlay scrollbar can absolutely position against the result list.
  resultsWrap: { flex: 1, minHeight: 0 },
  results: { flex: 1, minHeight: 0 },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  nameText: { flexShrink: 1, fontSize: 13 },
  contentRow: { paddingVertical: 5, paddingHorizontal: 6, borderRadius: 6, gap: 1 },
  contentHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  contentName: { flexShrink: 0, fontSize: 12.5 },
  contentPath: { flexShrink: 1, fontSize: 11 },
  contentLine: { fontSize: 11, paddingLeft: 21 },
  lineNo: { color: "#9a6700" },
  icon: { width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  hit: { backgroundColor: "rgba(9, 105, 218, 0.18)", color: FT_BLUE, fontWeight: "700" },
  skRow: { flexDirection: "row", alignItems: "center", gap: 8, height: 28, paddingHorizontal: 8 },
  skIcon: { width: 14, height: 14, borderRadius: 4 },
  skText: { height: 9, borderRadius: 4 },
  noMatch: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 28,
    paddingHorizontal: 18,
  },
  noMatchTitle: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  noMatchSub: { fontSize: 11.5, lineHeight: 17, maxWidth: 200, textAlign: "center" },
});
