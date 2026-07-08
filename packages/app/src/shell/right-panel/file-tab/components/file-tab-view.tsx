import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { isWeb } from "@/constants/platform";
import {
  IconAlert,
  IconCheck,
  IconDownload,
  IconEye,
  IconFolderOpen,
  IconLock,
  type PanelIcon,
  IconPencil,
  IconRefresh,
  IconSpinner,
  IconWifiOff,
} from "../../components/icons";
import { STATUS_TOKENS } from "../../theme/status-tokens";
import { themeModel } from "../../../theme/theme-model";
import type { FileDocumentModel } from "../model/file-document-model";
import { languageLabel } from "../model/status-line";
import { ContentMenu } from "./content-menu";
import { EditorSurface } from "./editor-surface";
import type { ConnectableEditorHandle } from "./editor-handle";
import { ImagePreview } from "./image-preview";
import { MarkdownPreview } from "./markdown-preview";

// The file tab's content view (ui.html sRS4–sRS7) — an observer that renders the FileDocumentModel by
// load state / kind / md view / read-only reason / conflict, and dispatches intents. It NEVER decides
// transitions (those live in the model): it maps loading→skeleton, error→retry, and per kind routes to
// the editor surface (code/text, md edit), the markdown preview, or the image/binary read-only fallback,
// wrapping it with the breadcrumb bar, the external-conflict bar, the autosave status bar, and the
// right-click content menu. There is deliberately NO save button, no ⌘S, no per-tab maximize.

export const FileTabView = observer(function FileTabView({
  doc,
  editorHandle,
  isOffline,
}: {
  doc: FileDocumentModel;
  editorHandle: ConnectableEditorHandle;
  isOffline: boolean;
}) {
  const rootRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const onCloseMenu = useCallback(() => setAnchor(null), []);

  // Open the content menu at the right-click point (relative to this view, where the menu is absolutely
  // positioned). Only for a loaded file — loading/error surfaces have no content menu. Web-only.
  useEffect(() => {
    if (!isWeb) {
      return;
    }
    const node = rootRef.current as unknown as HTMLElement | null;
    if (!node) {
      return;
    }
    const onContextMenu = (event: MouseEvent): void => {
      if (doc.loadState !== "loaded") {
        return;
      }
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      setAnchor({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    };
    node.addEventListener("contextmenu", onContextMenu);
    return () => node.removeEventListener("contextmenu", onContextMenu);
  }, [doc]);

  return (
    <View ref={rootRef} style={styles.root}>
      <FileBody doc={doc} editorHandle={editorHandle} isOffline={isOffline} />
      <ContentMenu doc={doc} anchor={anchor} onClose={onCloseMenu} />
    </View>
  );
});

// Route the body by load state: skeleton while reading, retry on error, empty when there is no file, else
// the loaded content.
const FileBody = observer(function FileBody({
  doc,
  editorHandle,
  isOffline,
}: {
  doc: FileDocumentModel;
  editorHandle: ConnectableEditorHandle;
  isOffline: boolean;
}) {
  if (!doc.path) {
    return <EmptyState />;
  }
  if (doc.loadState === "error") {
    return <ErrorState onRetry={doc.load} />;
  }
  if (doc.loadState !== "loaded") {
    return <LoadingState />;
  }
  return <LoadedFile doc={doc} editorHandle={editorHandle} isOffline={isOffline} />;
});

// The loaded file: breadcrumb bar, optional conflict/capability bars, the kind-specific body (frozen +
// dimmed offline), the non-blocking autosave-failure strip, and the status bar.
const LoadedFile = observer(function LoadedFile({
  doc,
  editorHandle,
  isOffline,
}: {
  doc: FileDocumentModel;
  editorHandle: ConnectableEditorHandle;
  isOffline: boolean;
}) {
  const isEditorKind = doc.kind === "code" || doc.kind === "text";
  const isMarkdown = doc.kind === "markdown";
  const capabilityReadOnly = doc.readOnlyReason === "capability" && (isEditorKind || isMarkdown);
  const showStatusBar = isEditorKind || (isMarkdown && doc.mdView === "edit");
  const showAutosaveWarn = doc.save.status === "failed" && !isOffline;
  const innerStyle = useMemo(
    () => (isOffline ? [styles.bodyInner, styles.frozen] : styles.bodyInner),
    [isOffline],
  );

  return (
    <>
      <FileBar doc={doc} />
      {doc.conflict ? <ConflictBar doc={doc} /> : null}
      {capabilityReadOnly ? <CapabilityHint /> : null}
      <View style={styles.body} pointerEvents={isOffline ? "none" : "auto"}>
        <View style={innerStyle}>
          <FileContent doc={doc} editorHandle={editorHandle} isOffline={isOffline} />
        </View>
      </View>
      {showAutosaveWarn ? <AutosaveWarn /> : null}
      {showStatusBar ? <StatusBar doc={doc} isOffline={isOffline} /> : null}
    </>
  );
});

// The kind-specific content: image / binary read-only fallbacks, markdown preview⇄edit, else the editor.
const FileContent = observer(function FileContent({
  doc,
  editorHandle,
  isOffline,
}: {
  doc: FileDocumentModel;
  editorHandle: ConnectableEditorHandle;
  isOffline: boolean;
}) {
  if (doc.kind === "image") {
    return <ImagePreview doc={doc} />;
  }
  if (doc.kind === "binary") {
    return <BinaryFallback />;
  }
  if (doc.kind === "markdown" && doc.mdView === "preview") {
    return <MarkdownPreview doc={doc} editorHandle={editorHandle} />;
  }
  return <EditorSurface doc={doc} editorHandle={editorHandle} frozen={isOffline} />;
});

// The read-only path breadcrumb (folder icon + parent dirs + current file), the dirty dot, and the
// right-side affordances: the markdown preview⇄edit segment control and/or the read-only badge. No save
// or maximize button (both deliberately absent this round).
const FileBar = observer(function FileBar({ doc }: { doc: FileDocumentModel }) {
  const tk = themeModel.tokens;
  const status = STATUS_TOKENS[themeModel.scheme];
  const segments = doc.path.split("/").filter(Boolean);
  const dirs = segments.slice(0, -1);
  const file = segments[segments.length - 1] ?? doc.path;
  const isDirty = doc.save.status === "dirty";
  const s = useMemo(
    () => ({
      bar: [styles.fileBar, { borderColor: tk.border }],
      dir: [styles.crumbDir, { color: tk.foregroundMuted }],
      cur: [styles.crumbCur, { color: tk.foreground }],
      ddot: [styles.ddot, { backgroundColor: status.warning }],
    }),
    [tk.border, tk.foregroundMuted, tk.foreground, status.warning],
  );
  return (
    <View style={s.bar}>
      <View style={styles.crumb}>
        <IconFolderOpen size={12} color={tk.foregroundMuted} />
        {dirs.map((dir, index) => (
          <Text key={dirs.slice(0, index + 1).join("/")} style={s.dir} numberOfLines={1}>
            {dir} ›{" "}
          </Text>
        ))}
        <Text style={s.cur} numberOfLines={1}>
          {file}
        </Text>
        {isDirty ? <View style={s.ddot} /> : null}
      </View>
      <View style={styles.fileActs}>
        {doc.kind === "markdown" ? <MdSegment doc={doc} /> : null}
        {doc.readOnlyReason ? <ReadOnlyBadge /> : null}
      </View>
    </View>
  );
});

// The markdown preview⇄edit segment control; the active segment reads the chrome surface over the pill.
const MdSegment = observer(function MdSegment({ doc }: { doc: FileDocumentModel }) {
  const tk = themeModel.tokens;
  const onToggle = useCallback(() => doc.toggleMdView(), [doc]);
  const preview = doc.mdView === "preview";
  const segStyle = useMemo(
    () => [styles.seg, { backgroundColor: tk.toggleActive }],
    [tk.toggleActive],
  );
  return (
    <View style={segStyle}>
      <SegItem active={preview} onPress={onToggle} icon="eye" label="预览" />
      <SegItem active={!preview} onPress={onToggle} icon="pencil" label="编辑" />
    </View>
  );
});

// One segment of the md view control.
function SegItem({
  active,
  onPress,
  icon,
  label,
}: {
  active: boolean;
  onPress: () => void;
  icon: "eye" | "pencil";
  label: string;
}) {
  const tk = themeModel.tokens;
  const Icon = icon === "eye" ? IconEye : IconPencil;
  const color = active ? tk.foreground : tk.foregroundMuted;
  const weight: "600" | "400" = active ? "600" : "400";
  const itemStyle = useMemo(
    () => (active ? [styles.segItem, { backgroundColor: tk.surfaceCard }] : styles.segItem),
    [active, tk.surfaceCard],
  );
  const textStyle = useMemo(() => [styles.segText, { color, fontWeight: weight }], [color, weight]);
  return (
    <Pressable style={itemStyle} onPress={onPress} accessibilityRole="button">
      <Icon size={12} color={color} />
      <Text style={textStyle}>{label}</Text>
    </Pressable>
  );
}

// The read-only chip in the file bar (image / binary / capability-gated files).
function ReadOnlyBadge() {
  const tk = themeModel.tokens;
  const badge = useMemo(
    () => [styles.roBadge, { backgroundColor: tk.toggleActive }],
    [tk.toggleActive],
  );
  const text = useMemo(() => [styles.roText, { color: tk.foregroundMuted }], [tk.foregroundMuted]);
  return (
    <View style={badge}>
      <IconLock size={12} color={tk.foregroundMuted} />
      <Text style={text}>只读</Text>
    </View>
  );
}

// The external-change conflict bar (the one blocking prompt): three determinate exits routed to the model.
const ConflictBar = observer(function ConflictBar({ doc }: { doc: FileDocumentModel }) {
  const tk = themeModel.tokens;
  const status = STATUS_TOKENS[themeModel.scheme];
  const comparing = doc.conflict?.comparing ?? null;
  const onReload = useCallback(() => void doc.resolveConflict("reload"), [doc]);
  const onKeepLocal = useCallback(() => void doc.resolveConflict("keepLocal"), [doc]);
  const onDiff = useCallback(() => void doc.resolveConflict("diff"), [doc]);
  const bar = useMemo(
    () => [
      styles.conflictBar,
      {
        backgroundColor: withAlpha(status.warning, 0.12),
        borderColor: withAlpha(status.warning, 0.3),
      },
    ],
    [status.warning],
  );
  const text = useMemo(() => [styles.conflictText, { color: tk.foreground }], [tk.foreground]);
  return (
    <>
      <View style={bar}>
        <IconAlert size={14} color={status.warning} />
        <Text style={text} numberOfLines={1}>
          文件在磁盘上已被外部更改
        </Text>
        <View style={styles.conflictActs}>
          <ConflictAction label="对比" onPress={onDiff} />
          <ConflictAction label="保留本地" onPress={onKeepLocal} />
          <ConflictAction label="重载" onPress={onReload} primary />
        </View>
      </View>
      {comparing ? <CompareView hostContent={comparing.hostContent} /> : null}
    </>
  );
});

// One conflict-bar action button (outlined, or filled primary for reload).
function ConflictAction({
  label,
  onPress,
  primary,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const tk = themeModel.tokens;
  const style = useMemo(
    () =>
      primary
        ? [styles.ca, { backgroundColor: tk.accent, borderColor: "transparent" }]
        : [styles.ca, { backgroundColor: tk.surfaceCard, borderColor: tk.border }],
    [primary, tk.accent, tk.surfaceCard, tk.border],
  );
  const text = useMemo(
    () => [styles.caText, { color: primary ? "#ffffff" : tk.foreground }],
    [primary, tk.foreground],
  );
  return (
    <Pressable style={style} onPress={onPress} accessibilityRole="button">
      <Text style={text}>{label}</Text>
    </Pressable>
  );
}

// The side-by-side compare pane populated when the user picks "对比": the host's latest content shown
// read-only beneath the conflict bar. Scrollable mono text — the reload/keepLocal exits stay in the bar.
function CompareView({ hostContent }: { hostContent: string }) {
  const tk = themeModel.tokens;
  const pane = useMemo(
    () => [styles.compare, { borderColor: tk.border, backgroundColor: tk.surfaceSidebar }],
    [tk.border, tk.surfaceSidebar],
  );
  const label = useMemo(
    () => [styles.compareLabel, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  const text = useMemo(() => [styles.compareText, { color: tk.foreground }], [tk.foreground]);
  return (
    <View style={pane}>
      <Text style={label}>主机最新</Text>
      <ScrollView style={styles.compareScroll}>
        <Text style={text}>{hostContent}</Text>
      </ScrollView>
    </View>
  );
}

// The capability-gate hint shown when the host can't write file content: the tab is read-only and the
// user must update the host (no degraded write path).
function CapabilityHint() {
  const tk = themeModel.tokens;
  const bar = useMemo(
    () => [
      styles.capHint,
      { backgroundColor: tk.accentSoft, borderColor: withAlpha(tk.accent, 0.3) },
    ],
    [tk.accentSoft, tk.accent],
  );
  const text = useMemo(() => [styles.capText, { color: tk.foreground }], [tk.foreground]);
  return (
    <View style={bar}>
      <IconDownload size={14} color={tk.accent} />
      <Text style={text} numberOfLines={2}>
        此文件为只读——更新主机以启用编辑写回。
      </Text>
    </View>
  );
}

// The non-blocking autosave-failure strip: a thin red note, no retry button (edits are kept and retried
// on the next blur).
function AutosaveWarn() {
  const status = STATUS_TOKENS[themeModel.scheme];
  const bar = useMemo(
    () => [
      styles.autosaveWarn,
      {
        backgroundColor: withAlpha(status.danger, 0.1),
        borderColor: withAlpha(status.danger, 0.24),
      },
    ],
    [status.danger],
  );
  const text = useMemo(() => [styles.autosaveText, { color: status.danger }], [status.danger]);
  return (
    <View style={bar}>
      <IconAlert size={12} color={status.danger} />
      <Text style={text}>自动保存失败 · 改动保留，编辑/失焦后自动重试</Text>
    </View>
  );
}

// The bottom status bar: language / encoding / line-ending + the autosave state (or the frozen indicator
// when offline). Cursor row/column is not shown (the editor owns the cursor; the model has no position).
const StatusBar = observer(function StatusBar({
  doc,
  isOffline,
}: {
  doc: FileDocumentModel;
  isOffline: boolean;
}) {
  const tk = themeModel.tokens;
  const bar = useMemo(
    () => [styles.status, { borderColor: tk.border, backgroundColor: tk.surfaceSidebar }],
    [tk.border, tk.surfaceSidebar],
  );
  const meta = useMemo(
    () => [styles.statusText, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  return (
    <View style={bar}>
      <Text style={meta}>{languageLabel(doc.path)}</Text>
      <Text style={meta}>UTF-8</Text>
      <Text style={meta}>LF</Text>
      <View style={styles.statusSpacer} />
      {isOffline ? (
        <SaveIndicator icon={IconWifiOff} label="已冻结" color={tk.foregroundMuted} />
      ) : (
        <SaveState doc={doc} />
      )}
    </View>
  );
});

// The autosave lifecycle indicator: dirty (amber, "未落盘" — with the conflict note when a host change is
// pending), saving (spinner), saved (check), failed (red), clean (nothing).
const SaveState = observer(function SaveState({ doc }: { doc: FileDocumentModel }) {
  const tk = themeModel.tokens;
  const status = STATUS_TOKENS[themeModel.scheme];
  const conflicted = doc.conflict !== null;
  switch (doc.save.status) {
    case "dirty":
      return (
        <SaveIndicator
          icon={IconAlert}
          label={conflicted ? "未落盘 · 有外部变更" : "编辑中·未落盘"}
          color={status.warning}
        />
      );
    case "saving":
      return <SaveIndicator icon={IconSpinner} label="自动保存中…" color={tk.accent} spinning />;
    case "saved":
      return <SaveIndicator icon={IconCheck} label="已自动保存" color={status.success} />;
    case "failed":
      return <SaveIndicator icon={IconAlert} label="自动保存失败·非阻塞" color={status.danger} />;
    case "clean":
      return null;
  }
});

// One status-bar indicator (icon + label in a role color). The spinner variant applies a web CSS spin.
function SaveIndicator({
  icon: Icon,
  label,
  color,
  spinning,
}: {
  icon: PanelIcon;
  label: string;
  color: string;
  spinning?: boolean;
}) {
  const text = useMemo(() => [styles.saveText, { color }], [color]);
  return (
    <View style={styles.saveInd}>
      <View style={spinning && isWeb ? webSpinStyle : undefined}>
        <Icon size={12} color={color} />
      </View>
      <Text style={text}>{label}</Text>
    </View>
  );
}

// The "选择一个文件" empty state (no file bound to the tab).
function EmptyState() {
  const tk = themeModel.tokens;
  return (
    <StateScreen
      icon={IconFolderOpen}
      iconColor={tk.foregroundMuted}
      iconBg={tk.toggleActive}
      title="选择一个文件"
      subtitle="从目录树点一个文件，或在对话里点某个文档地址，即可在此打开。"
    />
  );
}

// The read-only fallback for a binary / unrecognized file (no edit affordance).
function BinaryFallback() {
  const tk = themeModel.tokens;
  return (
    <StateScreen
      icon={IconLock}
      iconColor={tk.foregroundMuted}
      iconBg={tk.toggleActive}
      title="无法编辑此文件"
      subtitle="二进制 / 未识别类型，无法富预览或编辑。"
    />
  );
}

// The read-in-progress state (a spinner + label; the panel is small so a full skeleton is unnecessary).
const LoadingState = observer(function LoadingState() {
  const tk = themeModel.tokens;
  const title = useMemo(() => [styles.stateTitle, { color: tk.foreground }], [tk.foreground]);
  return (
    <View style={styles.state}>
      <IconSpinner size={22} color={tk.accent} />
      <Text style={title}>读取文件…</Text>
    </View>
  );
});

// The read-failure state with a retry that re-runs the model's load.
const ErrorState = observer(function ErrorState({ onRetry }: { onRetry: () => void }) {
  const status = STATUS_TOKENS[themeModel.scheme];
  const tk = themeModel.tokens;
  const chip = useMemo(
    () => [styles.stateIcon, { backgroundColor: withAlpha(status.danger, 0.12) }],
    [status.danger],
  );
  const title = useMemo(() => [styles.stateTitle, { color: tk.foreground }], [tk.foreground]);
  const sub = useMemo(() => [styles.stateSub, { color: tk.foregroundMuted }], [tk.foregroundMuted]);
  const btn = useMemo(
    () => [
      styles.retryBtn,
      { borderColor: withAlpha(tk.accent, 0.35), backgroundColor: withAlpha(tk.accent, 0.06) },
    ],
    [tk.accent],
  );
  const btnText = useMemo(() => [styles.retryText, { color: tk.accent }], [tk.accent]);
  return (
    <View style={styles.state}>
      <View style={chip}>
        <IconAlert size={22} color={status.danger} />
      </View>
      <Text style={title}>无法读取该文件</Text>
      <Text style={sub}>权限被拒或文件已删除。</Text>
      <Pressable style={btn} onPress={onRetry} accessibilityRole="button">
        <IconRefresh size={12} color={tk.accent} />
        <Text style={btnText}>重试</Text>
      </Pressable>
    </View>
  );
});

// A centered state screen (icon chip + title + subtitle) shared by empty / binary fallbacks.
function StateScreen({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  subtitle,
}: {
  icon: PanelIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
}) {
  const tk = themeModel.tokens;
  const chip = useMemo(() => [styles.stateIcon, { backgroundColor: iconBg }], [iconBg]);
  const titleStyle = useMemo(() => [styles.stateTitle, { color: tk.foreground }], [tk.foreground]);
  const subStyle = useMemo(
    () => [styles.stateSub, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  return (
    <View style={styles.state}>
      <View style={chip}>
        <Icon size={22} color={iconColor} />
      </View>
      <Text style={titleStyle}>{title}</Text>
      <Text style={subStyle}>{subtitle}</Text>
    </View>
  );
}

// Overlay an alpha channel onto a hex token so status bars/hints can tint their own backgrounds without
// new tokens (mirrors the ui.html color-mix washes); non-#rrggbb inputs pass through.
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = Number.parseInt(color.slice(1, 3), 16);
    const g = Number.parseInt(color.slice(3, 5), 16);
    const b = Number.parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

// The CSS spin animation for the saving spinner (web-only inline style; native shows the static icon).
const webSpinStyle = {
  animationKeyframes: [{ to: { transform: [{ rotate: "360deg" }] } }],
  animationDuration: "0.9s",
  animationIterationCount: "infinite",
  animationTimingFunction: "linear",
} as unknown as object;

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, position: "relative" },
  fileBar: {
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    paddingLeft: 12,
    paddingRight: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  crumb: { flexDirection: "row", alignItems: "center", gap: 5, minWidth: 0, flex: 1 },
  crumbDir: { fontFamily: "SFMono-Regular", fontSize: 12 },
  crumbCur: { fontFamily: "SFMono-Regular", fontSize: 12, flexShrink: 1 },
  ddot: { width: 7, height: 7, borderRadius: 4, marginLeft: 2 },
  fileActs: { flexDirection: "row", alignItems: "center", gap: 6 },
  seg: { flexDirection: "row", alignItems: "center", padding: 2, borderRadius: 7, gap: 2 },
  segItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 22,
    paddingHorizontal: 10,
    borderRadius: 5,
  },
  segText: { fontSize: 12 },
  roBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 9999,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  roText: { fontSize: 11 },
  body: { flex: 1, minHeight: 0 },
  bodyInner: { flex: 1, minHeight: 0 },
  frozen: { opacity: 0.5 },
  conflictBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  conflictText: { fontSize: 12, flexShrink: 1 },
  conflictActs: { flexDirection: "row", gap: 6, marginLeft: "auto" },
  ca: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 9, paddingVertical: 3 },
  caText: { fontSize: 11.5 },
  compare: { flex: 1, minHeight: 0, borderTopWidth: 1, padding: 8 },
  compareLabel: {
    fontFamily: "SFMono-Regular",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  compareScroll: { flex: 1, minHeight: 0 },
  compareText: { fontFamily: "SFMono-Regular", fontSize: 12, lineHeight: 18 },
  capHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  capText: { fontSize: 12, flexShrink: 1 },
  autosaveWarn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderTopWidth: 1,
  },
  autosaveText: { fontSize: 10.5, lineHeight: 15, flexShrink: 1 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    height: 25,
    paddingHorizontal: 12,
    gap: 14,
    borderTopWidth: 1,
  },
  statusText: { fontFamily: "SFMono-Regular", fontSize: 11 },
  statusSpacer: { flex: 1 },
  saveInd: { flexDirection: "row", alignItems: "center", gap: 4 },
  saveText: { fontFamily: "SFMono-Regular", fontSize: 11 },
  state: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  stateIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  stateTitle: { fontSize: 13.5, fontWeight: "600" },
  stateSub: { fontSize: 12, lineHeight: 18, textAlign: "center", maxWidth: 258 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  retryText: { fontSize: 12.5, fontWeight: "500" },
});
