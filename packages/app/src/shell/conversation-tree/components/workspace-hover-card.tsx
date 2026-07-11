import { Portal } from "@gorhom/portal";
import { Clock3, Folder, GitBranch } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { isWeb } from "@/constants/platform";
import {
  measureFloatingPanelPortalHost,
  useFloatingPanelPortalHostName,
} from "@/components/ui/floating-panel-portal";
import { themeModel } from "../../theme/theme-model";
import type { WorkspaceDetail } from "../model/types";

const CARD_WIDTH = 236;
const CARD_GAP = 8;
const SCREEN_GUTTER = 8;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Render the directory-backed conversation summary in a portal beside its row. */
export function WorkspaceHoverCard({
  visible,
  anchorRef,
  workspaceId,
  title,
  detail,
  onHoverIn,
  onHoverOut,
}: {
  visible: boolean;
  anchorRef: RefObject<View | null>;
  workspaceId: string;
  title: string;
  detail: WorkspaceDetail;
  onHoverIn: () => void;
  onHoverOut: () => void;
}) {
  const portalHostName = useFloatingPanelPortalHostName();
  const window = useWindowDimensions();
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [host, setHost] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(132);
  const tk = themeModel.tokens;

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
  const addedStyle = useMemo(
    () => [styles.diffText, { color: tk.statusSuccess }],
    [tk.statusSuccess],
  );
  const removedStyle = useMemo(
    () => [styles.diffText, { color: tk.statusDanger }],
    [tk.statusDanger],
  );
  const handleLayout = useCallback((event: { nativeEvent: { layout: { height: number } } }) => {
    setCardHeight(event.nativeEvent.layout.height);
  }, []);

  if (!visible || !isWeb || frameStyle === null) {
    return null;
  }
  return (
    <Portal hostName={portalHostName}>
      <Pressable
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        onLayout={handleLayout}
        style={cardStyle}
        testID={`conv-tree-workspace-hover-${workspaceId}`}
      >
        <Text numberOfLines={2} style={titleStyle}>
          {title}
        </Text>
        {detail.branch === null ? null : (
          <MetadataRow icon={GitBranch} value={detail.branch} color={tk.foregroundMuted} />
        )}
        <MetadataRow icon={Folder} value={detail.directory} color={tk.foregroundMuted} />
        <MetadataRow
          icon={Clock3}
          value={formatLastChange(detail.lastChangeAt)}
          color={tk.foregroundMuted}
        />
        {detail.diffStat === null ? null : (
          <View style={styles.diffRow}>
            <Text style={addedStyle}>+{detail.diffStat.added}</Text>
            <Text style={removedStyle}>-{detail.diffStat.removed}</Text>
          </View>
        )}
      </Pressable>
    </Portal>
  );
}

function MetadataRow({
  icon: Icon,
  value,
  color,
}: {
  icon: typeof Folder;
  value: string;
  color: string;
}) {
  const textStyle = useMemo(() => [styles.metadataText, { color }], [color]);
  return (
    <View style={styles.metadataRow}>
      <Icon size={12} color={color} />
      <Text numberOfLines={1} style={textStyle}>
        {value}
      </Text>
    </View>
  );
}

function formatLastChange(value: string | null): string {
  if (value === null) {
    return "暂无最近变更";
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return value;
  }
  const minutes = Math.max(0, Math.round((Date.now() - time) / 60_000));
  if (minutes < 1) {
    return "刚刚";
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }
  return `${Math.round(hours / 24)} 天前`;
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    width: CARD_WIDTH,
    borderWidth: 1,
    borderRadius: 8,
    paddingTop: 9,
    paddingBottom: 6,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 12,
  },
  title: { paddingHorizontal: 12, paddingBottom: 8, fontSize: 13, fontWeight: "500" },
  metadataRow: {
    minHeight: 24,
    paddingHorizontal: 12,
    paddingBottom: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metadataText: { flex: 1, minWidth: 0, fontSize: 11 },
  diffRow: { paddingHorizontal: 12, paddingBottom: 2, flexDirection: "row", gap: 6 },
  diffText: { fontFamily: "monospace", fontSize: 11 },
});
