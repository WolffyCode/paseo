import { Portal } from "@gorhom/portal";
import { Check, Clock3, FileDiff, Folder, GitBranch, Package } from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { isWeb } from "@/constants/platform";
import {
  measureFloatingPanelPortalHost,
  useFloatingPanelPortalHostName,
} from "@/components/ui/floating-panel-portal";
import { themeModel } from "../../theme/theme-model";
import type { WorkspaceDiffStat } from "../model/types";
import { resolveProviderBadge } from "../model/provider-label";
import { formatRelative } from "../model/relative-time";

const CARD_WIDTH = 280;
const CARD_GAP = 8;
const SCREEN_GUTTER = 8;
const HOVER_SAFE_ZONE_GRACE_MS = 100;
const COPY_FEEDBACK_MS = 2000;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type WorkspaceHoverCardContent =
  | {
      readonly kind: "project";
      readonly id: string;
      readonly title: string;
      readonly directory: string;
      readonly branch: string | null;
      readonly diffStat: WorkspaceDiffStat | null;
    }
  | {
      readonly kind: "conversation";
      readonly id: string;
      readonly title: string;
      readonly directory: string;
      readonly updatedAt: string;
      readonly providerId: string;
    };

export interface HoverRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Check whether point (x, y) falls inside rect, treating a missing rect as a miss. */
function isInsideHoverRect(rect: HoverRect | null, x: number, y: number): boolean {
  if (rect === null) return false;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

// Trigger rect ∪ content rect ∪ the rectangular bridge between them, so the pointer
// can cross the portal's real visual gap without dropping hover. Equivalent copy of
// @/hooks/hover-safe-zone-tracker.ts — architecture §4.2 requires copying this
// geometry (not importing) since it isn't in shell/ or a shared foundation package.
export function isInsideHoverSafeZone(
  trigger: HoverRect | null,
  content: HoverRect | null,
  x: number,
  y: number,
): boolean {
  if (isInsideHoverRect(trigger, x, y)) return true;
  if (isInsideHoverRect(content, x, y)) return true;
  if (trigger === null || content === null) return false;
  const bridgeLeft = Math.min(trigger.right, content.right);
  const bridgeRight = Math.max(trigger.left, content.left);
  if (bridgeLeft >= bridgeRight) return false;
  const bridgeTop = Math.min(trigger.top, content.top);
  const bridgeBottom = Math.max(trigger.bottom, content.bottom);
  return x >= bridgeLeft && x <= bridgeRight && y >= bridgeTop && y <= bridgeBottom;
}

interface HoverSafeZoneTrackerInput {
  getTriggerRect: () => HoverRect | null;
  getContentRect: () => HoverRect | null;
  onEnterSafeZone: () => void;
  onLeaveSafeZone: () => void;
}

interface HoverSafeZoneTracker {
  pointerMoved(x: number, y: number): void;
  pointerLeftWindow(): void;
  windowBlurred(): void;
}

// Fires onEnterSafeZone on every move that lands inside (so callers can refresh a
// pending-close timer) and onLeaveSafeZone once per inside→outside transition (not
// on every outside move) — bookkeeping equivalent to hover-safe-zone-tracker.ts.
export function createHoverSafeZoneTracker(input: HoverSafeZoneTrackerInput): HoverSafeZoneTracker {
  const { getTriggerRect, getContentRect, onEnterSafeZone, onLeaveSafeZone } = input;
  let wasInside = true;

  function leave(): void {
    if (!wasInside) return;
    wasInside = false;
    onLeaveSafeZone();
  }

  return {
    pointerMoved(x, y) {
      if (isInsideHoverSafeZone(getTriggerRect(), getContentRect(), x, y)) {
        wasInside = true;
        onEnterSafeZone();
        return;
      }
      leave();
    },
    pointerLeftWindow: leave,
    windowBlurred: leave,
  };
}

/** Read a mounted View's live screen rect for safe-zone geometry, or null before it's mounted. */
function readHoverRect(ref: RefObject<View | null>): HoverRect | null {
  const node = ref.current as unknown as Element | null;
  return node ? node.getBoundingClientRect() : null;
}

/** Wire the tracker to real pointer/window events: fires onEnter/onLeave as the pointer crosses the trigger/content safe zone or the window loses it. */
function useHoverSafeZone({
  enabled,
  triggerRef,
  contentRef,
  onEnterSafeZone,
  onLeaveSafeZone,
}: {
  enabled: boolean;
  triggerRef: RefObject<View | null>;
  contentRef: RefObject<View | null>;
  onEnterSafeZone: () => void;
  onLeaveSafeZone: () => void;
}): void {
  useEffect(() => {
    if (!isWeb || !enabled) return;
    const tracker = createHoverSafeZoneTracker({
      getTriggerRect: () => readHoverRect(triggerRef),
      getContentRect: () => readHoverRect(contentRef),
      onEnterSafeZone,
      onLeaveSafeZone,
    });

    function handlePointerMove(event: PointerEvent): void {
      tracker.pointerMoved(event.clientX, event.clientY);
    }

    function handlePointerOut(event: PointerEvent): void {
      if (event.relatedTarget === null) tracker.pointerLeftWindow();
    }

    function handleBlur(): void {
      tracker.windowBlurred();
    }

    document.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerout", handlePointerOut);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerout", handlePointerOut);
      window.removeEventListener("blur", handleBlur);
    };
  }, [enabled, triggerRef, contentRef, onEnterSafeZone, onLeaveSafeZone]);
}

/** Render project or conversation metadata in a portal beside its tree row. */
export function WorkspaceHoverCard({
  visible,
  anchorRef,
  content,
  onRequestClose,
}: {
  visible: boolean;
  anchorRef: RefObject<View | null>;
  content: WorkspaceHoverCardContent;
  onRequestClose: () => void;
}) {
  const portalHostName = useFloatingPanelPortalHostName();
  const window = useWindowDimensions();
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [host, setHost] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(132);
  const tk = themeModel.tokens;
  const contentRef = useRef<View | null>(null);
  const closeGraceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseGraceTimer = useCallback(() => {
    if (closeGraceTimer.current !== null) {
      clearTimeout(closeGraceTimer.current);
      closeGraceTimer.current = null;
    }
  }, []);
  const scheduleClose = useCallback(() => {
    clearCloseGraceTimer();
    closeGraceTimer.current = setTimeout(() => {
      closeGraceTimer.current = null;
      onRequestClose();
    }, HOVER_SAFE_ZONE_GRACE_MS);
  }, [clearCloseGraceTimer, onRequestClose]);

  // Keep the card open while the pointer is inside the row, the card, or the gap
  // between them; only ask the row to close once it truly leaves that safe zone.
  useHoverSafeZone({
    enabled: visible,
    triggerRef: anchorRef,
    contentRef,
    onEnterSafeZone: clearCloseGraceTimer,
    onLeaveSafeZone: scheduleClose,
  });

  useEffect(() => {
    return () => clearCloseGraceTimer();
  }, [clearCloseGraceTimer]);

  useEffect(() => {
    if (!visible || !isWeb || anchorRef.current === null) {
      setAnchor(null);
      setHost(null);
      return;
    }
    let cancelled = false;
    const element = anchorRef.current;
    element.measureInWindow((x, y, width, height) => {
      void measureFloatingPanelPortalHost(portalHostName).then((hostRect) => {
        if (!cancelled && hostRect !== null) {
          setAnchor({ x, y, width, height });
          setHost(hostRect);
        }
        return undefined;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [anchorRef, portalHostName, visible, window.height, window.width]);

  const frameStyle = useMemo(() => {
    if (anchor === null || host === null) {
      return null;
    }
    const right = anchor.x + anchor.width + CARD_GAP;
    const globalLeft =
      right + CARD_WIDTH <= window.width - SCREEN_GUTTER
        ? right
        : Math.max(SCREEN_GUTTER, anchor.x - CARD_WIDTH - CARD_GAP);
    const globalTop = Math.max(
      SCREEN_GUTTER,
      Math.min(anchor.y, window.height - cardHeight - SCREEN_GUTTER),
    );
    return {
      left: globalLeft - host.x,
      top: globalTop - host.y,
      backgroundColor: tk.surfaceCard,
      borderColor: tk.border,
    };
  }, [anchor, cardHeight, host, tk.border, tk.surfaceCard, window.height, window.width]);
  const cardStyle = useMemo(() => [styles.card, frameStyle], [frameStyle]);
  const titleStyle = useMemo(() => [styles.title, { color: tk.foreground }], [tk.foreground]);
  const fieldLabelStyle = useMemo(
    () => [styles.fieldLabel, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  const handleLayout = useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    setCardHeight(event.nativeEvent.layout.height);
  }, []);

  if (!visible || !isWeb || frameStyle === null) {
    return null;
  }
  return (
    <Portal hostName={portalHostName}>
      <View
        ref={contentRef}
        onLayout={handleLayout}
        style={cardStyle}
        testID={`conv-tree-hover-${content.kind}-${content.id}`}
      >
        <Text style={fieldLabelStyle}>{content.kind === "project" ? "标题" : "对话名称"}</Text>
        <Text numberOfLines={2} style={titleStyle}>
          {content.title}
        </Text>
        {content.kind === "project" ? (
          <>
            <MetadataRow
              icon={Folder}
              label="文件路径"
              value={content.directory}
              color={tk.foregroundMuted}
              valueColor={tk.foreground}
              copyValue={content.directory}
              copyLabel="复制文件路径"
              testID={`conv-tree-hover-copy-directory-${content.id}`}
              numberOfLines={2}
            />
            <MetadataRow
              icon={GitBranch}
              label="Git 分支"
              value={content.branch ?? "暂无分支"}
              color={tk.foregroundMuted}
              valueColor={tk.foreground}
              copyValue={content.branch ?? undefined}
              copyLabel="复制 Git 分支"
              testID={`conv-tree-hover-copy-branch-${content.id}`}
            />
            <DiffMetadataRow diffStat={content.diffStat} />
          </>
        ) : (
          <>
            <MetadataRow
              icon={Folder}
              label="操作目录"
              value={content.directory}
              color={tk.foregroundMuted}
              valueColor={tk.foreground}
              copyValue={content.directory}
              copyLabel="复制操作目录"
              testID={`conv-tree-hover-copy-directory-${content.id}`}
              numberOfLines={2}
            />
            <MetadataRow
              icon={Clock3}
              label="最后一次使用"
              value={formatRelative(content.updatedAt, Date.now())}
              color={tk.foregroundMuted}
              valueColor={tk.foreground}
            />
            <MetadataRow
              icon={Package}
              label="提供方"
              value={resolveProviderBadge(content.providerId).label}
              color={tk.foregroundMuted}
              valueColor={tk.foreground}
            />
          </>
        )}
      </View>
    </Portal>
  );
}

/** Render one icon+text metadata line; becomes a copy-to-clipboard button when copyValue is given. */
function MetadataRow({
  icon: Icon,
  label,
  value,
  color,
  valueColor,
  copyValue,
  copyLabel,
  testID,
  numberOfLines = 1,
}: {
  icon: typeof Folder;
  label: string;
  value: string;
  color: string;
  valueColor: string;
  copyValue?: string;
  copyLabel?: string;
  testID?: string;
  numberOfLines?: number;
}) {
  const labelStyle = useMemo(() => [styles.metadataLabel, { color }], [color]);
  const textStyle = useMemo(() => [styles.metadataText, { color: valueColor }], [valueColor]);
  const [copied, setCopied] = useState(false);
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyFeedbackTimer.current !== null) clearTimeout(copyFeedbackTimer.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    if (copyValue === undefined || !isWeb) return;
    void navigator.clipboard.writeText(copyValue).catch(() => {});
    setCopied(true);
    if (copyFeedbackTimer.current !== null) clearTimeout(copyFeedbackTimer.current);
    copyFeedbackTimer.current = setTimeout(() => {
      setCopied(false);
      copyFeedbackTimer.current = null;
    }, COPY_FEEDBACK_MS);
  }, [copyValue]);

  if (copyValue === undefined) {
    return (
      <View style={styles.metadataRow}>
        <Icon size={12} color={color} />
        <View style={styles.metadataBody}>
          <Text style={labelStyle}>{label}</Text>
          <Text numberOfLines={numberOfLines} style={textStyle}>
            {value}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copyLabel}
      hitSlop={4}
      onPress={handleCopy}
      style={styles.metadataRow}
      testID={testID}
    >
      {copied ? <Check size={12} color={color} /> : <Icon size={12} color={color} />}
      <View style={styles.metadataBody}>
        <Text style={labelStyle}>{label}</Text>
        <Text numberOfLines={numberOfLines} style={textStyle}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

/** Render a project's complete git diff summary, including its clean or unavailable state. */
function DiffMetadataRow({ diffStat }: { diffStat: WorkspaceDiffStat | null }) {
  const tk = themeModel.tokens;
  const labelStyle = useMemo(
    () => [styles.metadataLabel, { color: tk.foregroundMuted }],
    [tk.foregroundMuted],
  );
  const valueStyle = useMemo(
    () => [styles.metadataText, { color: tk.foreground }],
    [tk.foreground],
  );
  const addedStyle = useMemo(
    () => [styles.diffText, { color: tk.statusSuccess }],
    [tk.statusSuccess],
  );
  const removedStyle = useMemo(
    () => [styles.diffText, { color: tk.statusDanger }],
    [tk.statusDanger],
  );
  let value: ReactNode;
  if (diffStat === null) {
    value = <Text style={valueStyle}>暂无数据</Text>;
  } else if (diffStat.added === 0 && diffStat.removed === 0) {
    value = <Text style={valueStyle}>无变更</Text>;
  } else {
    value = (
      <View style={styles.diffRow}>
        <Text style={addedStyle}>+{diffStat.added}</Text>
        <Text style={removedStyle}>-{diffStat.removed}</Text>
      </View>
    );
  }
  return (
    <View style={styles.metadataRow}>
      <FileDiff size={12} color={tk.foregroundMuted} />
      <View style={styles.metadataBody}>
        <Text style={labelStyle}>Git diff</Text>
        {value}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    width: CARD_WIDTH,
    borderWidth: 1,
    borderRadius: 8,
    paddingTop: 10,
    paddingBottom: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 12,
  },
  fieldLabel: { paddingHorizontal: 12, paddingBottom: 3, fontSize: 10, lineHeight: 13 },
  title: { paddingHorizontal: 12, paddingBottom: 10, fontSize: 13, lineHeight: 18 },
  metadataRow: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  metadataBody: { flex: 1, minWidth: 0, gap: 2 },
  metadataLabel: { fontSize: 10, lineHeight: 13 },
  metadataText: { fontSize: 11, lineHeight: 15 },
  diffRow: { minHeight: 15, flexDirection: "row", alignItems: "center", gap: 6 },
  diffText: { fontFamily: "monospace", fontSize: 11 },
});
