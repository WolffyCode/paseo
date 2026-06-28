// Host → Usage — read-only plan-usage for one host: per-provider balance / used /
// remaining, re-skinned onto the codePilot settings kit. Pure re-skin: the data wiring is
// reused unchanged from the legacy HostUsagePage — the same useProviderUsage hook and
// provider.usage.list RPC (capability-gated by server_info.features.providerUsageList) —
// only the presentation moves to the kit. Refresh re-pulls from the host; nothing here writes.
//
// TODO(i18n): provider-usage copy + amount/reset/ago formatting still live in the English-only
// `@/provider-usage/copy` + `@/provider-usage/format` modules (see copy.ts INTEGRATION note).
// The UI chrome below uses Chinese literals (matching the approved CodePilot design and the
// sibling about/host-connections sections); reset/ago strings come from the shared formatter
// and read English until that module gets a localization pass. Numbers themselves are neutral.
import { type ComponentType, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  type StyleProp,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { AlertTriangle, Info, Lock, RefreshCw, WifiOff } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { getProviderIcon } from "@/components/provider-icons";
import { providerUsageCopy } from "@/provider-usage/copy";
import {
  clampPct,
  formatAgo,
  formatAmount,
  formatPct,
  formatResetLabel,
} from "@/provider-usage/format";
import { deriveTone } from "@/provider-usage/tone";
import type {
  ProviderUsage,
  ProviderUsageBalance,
  ProviderUsageListPayload,
  ProviderUsageTone,
  ProviderUsageWindow,
} from "@/provider-usage/types";
import { useProviderUsage } from "@/provider-usage/use-provider-usage";
import type { Theme } from "@/styles/theme";
import {
  SettingsAlert,
  SettingsBadge,
  SettingsButton,
  SettingsDetail,
  SettingsEmpty,
  SettingsGroup,
  SettingsValue,
} from "../primitives";

const SUBTITLE = "看看各家用了多少、还剩多少。只读；刷新就向主机拉最新。";

type IconType = ComponentType<{ size?: number; color?: string }>;
type StatusTone = "muted" | "success" | "warning" | "error";

// One normalized meter row (balance limit-bar or usage window): a labeled, optionally
// filled thin bar plus an optional reset/runs-out note. Built by the pure helpers below so
// the rendering components stay presentation-only.
interface MeterModel {
  label: string;
  valueText: string;
  pct: number | null;
  tone: ProviderUsageTone;
  note: string | null;
  noteTone: ProviderUsageTone;
}

// ---- pure model helpers (no React, no theme) ----

// Recover the three design states the kit renders distinctly (offline / gated / fetch-error)
// from the shared useProviderUsage view, which collapses all three into { kind:"error", message }.
// We match the two sentinel messages the hook emits by reference; anything else is a real failure.
function classifyUsageError(message: string): "offline" | "gated" | "error" {
  if (message === providerUsageCopy.hostUnavailable) return "offline";
  if (message === providerUsageCopy.hostUpgradeRequired) return "gated";
  return "error";
}

// The fraction of a window that is used, normalizing the two encodings the protocol allows
// (explicit usedPct, or remainingPct counted down from 100). Null when neither is present.
function windowUsedPct(window: ProviderUsageWindow): number | null {
  if (window.usedPct != null) return window.usedPct;
  if (window.remainingPct != null) return 100 - window.remainingPct;
  return null;
}

// The fraction of a balance that is used, derived from used/limit (or limit−remaining).
// Null when no limit is known (an open balance has no meaningful fill).
function balanceUsedPct(balance: ProviderUsageBalance): number | null {
  const { used, remaining, limit } = balance;
  if (limit == null || limit <= 0) return null;
  const usedAmount = used ?? (remaining != null ? limit - remaining : null);
  return usedAmount != null ? (usedAmount / limit) * 100 : null;
}

const TONE_RANK: Record<ProviderUsageTone, number> = { default: 0, ok: 0, warning: 1, danger: 2 };
const RANK_TONE: ProviderUsageTone[] = ["default", "warning", "danger"];

// The worst (most at-risk) tone across a provider's windows and balances — drives the
// header status badge. Explicit tones win; otherwise we derive from the used percentage,
// matching the legacy window/balance bars.
function providerRiskTone(usage: ProviderUsage): ProviderUsageTone {
  let rank = 0;
  for (const window of usage.windows) {
    rank = Math.max(rank, TONE_RANK[window.tone ?? deriveTone(windowUsedPct(window))]);
  }
  for (const balance of usage.balances ?? []) {
    rank = Math.max(rank, TONE_RANK[balance.tone ?? deriveTone(balanceUsedPct(balance))]);
  }
  return RANK_TONE[rank];
}

// The header status badge for one provider: gated (no usage reported), errored, near-limit,
// or healthy. Always returns a badge so the header has a consistent right-hand marker.
function deriveProviderStatus(usage: ProviderUsage): {
  label: string;
  tone: StatusTone;
  icon?: IconType;
} {
  if (usage.status === "unavailable") return { label: "暂不支持用量", tone: "muted", icon: Lock };
  if (usage.status === "error") return { label: "拉取失败", tone: "error", icon: AlertTriangle };
  const risk = providerRiskTone(usage);
  if (risk === "warning" || risk === "danger") {
    return { label: "接近限额", tone: "warning", icon: AlertTriangle };
  }
  return { label: "正常", tone: "success" };
}

// The honest Chinese suffix for the headline balance number — only "还能用" / "已用", set
// from which field actually supplied the number so we never mislabel a used amount as remaining.
function balanceSemanticLabel(semantic: "remaining" | "used" | "limit" | null): string | null {
  if (semantic === "remaining") return "还能用";
  if (semantic === "used") return "已用";
  return null;
}

// Normalize one balance into a prominent headline (amount + caption) plus, when a limit is
// known, a used/limit meter. The headline prefers remaining (what's still usable), then used,
// then limit; caption = the provider's own label + the honest semantic.
function buildBalanceReadout(balance: ProviderUsageBalance): {
  primaryText: string;
  caption: string | null;
  meter: MeterModel | null;
} {
  const { used, remaining, limit, unit, label, tone, resetsAt } = balance;
  let amount: number | null = null;
  let semantic: "remaining" | "used" | "limit" | null = null;
  if (remaining != null) {
    amount = remaining;
    semantic = "remaining";
  } else if (used != null) {
    amount = used;
    semantic = "used";
  } else if (limit != null) {
    amount = limit;
    semantic = "limit";
  }
  const primaryText = amount != null ? formatAmount(amount, unit) : "—";
  const caption = [label, balanceSemanticLabel(semantic)].filter(Boolean).join(" · ") || null;

  let meter: MeterModel | null = null;
  if (limit != null && limit > 0) {
    const usedAmount = used ?? (remaining != null ? limit - remaining : null);
    const pct = balanceUsedPct(balance);
    const usedText = usedAmount != null ? formatAmount(usedAmount, unit) : "—";
    const pctText = pct != null ? ` · ${formatPct(pct)}` : "";
    meter = {
      label: "已用",
      valueText: `${usedText} / ${formatAmount(limit, unit)}${pctText}`,
      pct,
      tone: tone ?? deriveTone(pct),
      note: formatResetLabel(resetsAt),
      noteTone: tone ?? "default",
    };
  }
  return { primaryText, caption, meter };
}

// Normalize one usage window into a percentage meter with a reset (or at-risk runs-out) note.
function buildWindowMeter(window: ProviderUsageWindow): MeterModel {
  const pct = windowUsedPct(window);
  const atRisk = window.runsOutAt != null && window.shortfallPct != null;
  const note = atRisk ? formatResetLabel(window.runsOutAt) : formatResetLabel(window.resetsAt);
  return {
    label: window.label,
    valueText: pct != null ? formatPct(pct) : "—",
    pct,
    tone: window.tone ?? deriveTone(pct),
    note,
    noteTone: atRisk ? "danger" : "default",
  };
}

// The per-block footer line: source + "updated …", joined when present, else null.
function buildProviderFooter(usage: ProviderUsage): string | null {
  const updated = formatAgo(usage.fetchedAt);
  const parts = [usage.sourceLabel, updated ? `更新于 ${updated}` : null].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

// The section footer line: when the payload was last fetched from the host.
function buildUpdatedText(fetchedAt: string): string {
  const ago = formatAgo(fetchedAt);
  return ago ? `数据由当前主机回传 · 更新于 ${ago}` : "数据由当前主机回传";
}

// ---- screen ----

// Host → Usage detail pane. Reuses the legacy usage wiring (useProviderUsage) and dispatches
// the view to the matching kit state. Refresh re-pulls from the host.
export function HostUsageSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { view, refresh } = useProviderUsage(serverId);
  const handleRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);
  const busy = view.kind === "loading" || (view.kind === "ready" && view.isRefreshing);

  return (
    <SettingsDetail title={t("settings.hostSections.usage")} subtitle={SUBTITLE}>
      <UsageBody view={view} busy={busy} onRefresh={handleRefresh} />
    </SettingsDetail>
  );
}

// Routes the usage view to one state renderer: loading / error (offline·gated·fetch) /
// empty / ready. Keeps each boundary state in its own small component.
function UsageBody({
  view,
  busy,
  onRefresh,
}: {
  view: ReturnType<typeof useProviderUsage>["view"];
  busy: boolean;
  onRefresh: () => void;
}) {
  if (view.kind === "loading") {
    return <LoadingState />;
  }
  if (view.kind === "error") {
    return <ErrorState message={view.message} onRefresh={onRefresh} />;
  }
  if (view.payload.providers.length === 0) {
    return <EmptyState busy={busy} onRefresh={onRefresh} />;
  }
  return <ReadyState payload={view.payload} busy={busy} onRefresh={onRefresh} />;
}

// Loading — first load / host switch: a centered spinner while we pull usage from the host.
function LoadingState() {
  return (
    <View style={styles.stateBox}>
      <ThemedActivityIndicator uniProps={mutedColorMapping} />
      <Text style={styles.stateText}>正在向主机拉取各提供方用量…</Text>
    </View>
  );
}

// Error — splits the collapsed error view into the offline / gated / fetch-error designs.
// Offline and gated are terminal callouts (refresh won't help); a real fetch error offers retry.
function ErrorState({ message, onRefresh }: { message: string; onRefresh: () => void }) {
  const kind = classifyUsageError(message);
  if (kind === "gated") {
    return (
      <SettingsAlert
        tone="warning"
        icon={Lock}
        title="更新主机以查看用量"
        description="当前主机版本较旧，未回传用量；把这台主机升级到新版后会自动显示。"
      />
    );
  }
  if (kind === "offline") {
    return (
      <SettingsAlert
        tone="error"
        icon={WifiOff}
        title="主机已离线"
        description="无法连接到该主机以获取用量；恢复在线后会自动重试。"
      />
    );
  }
  // TODO: the offline state can't show cached values — the shared useProviderUsage hook drops
  // the payload when the host disconnects. Surfacing cached usage needs a hook change (out of
  // this section's scope); we show an honest callout instead of fabricating numbers.
  return (
    <>
      <SettingsAlert tone="error" icon={AlertTriangle} title="用量获取失败" description={message} />
      <View style={styles.retryWrap}>
        <SettingsButton label="重试" icon={RefreshCw} variant="outline" small onPress={onRefresh} />
      </View>
    </>
  );
}

// Empty — the host answered with zero providers reporting usage in this window.
function EmptyState({ busy, onRefresh }: { busy: boolean; onRefresh: () => void }) {
  const action = useMemo(
    () => <RefreshButton busy={busy} onRefresh={onRefresh} />,
    [busy, onRefresh],
  );
  // TODO: the design's "去模型与提供方" deep-link needs navigation this isolated section
  // can't wire (the export takes only serverId); omitted rather than rendered as a dead button.
  return (
    <SettingsGroup action={action}>
      <SettingsEmpty message="本周还没有用量" />
    </SettingsGroup>
  );
}

// Ready — a top gated notice (when some providers can't report), one block per provider, and a
// footer with the fetch time. Refresh stays available; existing values remain visible while
// refreshing (the busy flag only reflects into the button).
function ReadyState({
  payload,
  busy,
  onRefresh,
}: {
  payload: ProviderUsageListPayload;
  busy: boolean;
  onRefresh: () => void;
}) {
  const action = useMemo(
    () => <RefreshButton busy={busy} onRefresh={onRefresh} />,
    [busy, onRefresh],
  );
  const gatedCount = useMemo(
    () => payload.providers.filter((provider) => provider.status === "unavailable").length,
    [payload.providers],
  );
  const updatedText = useMemo(() => buildUpdatedText(payload.fetchedAt), [payload.fetchedAt]);

  return (
    <>
      {gatedCount > 0 ? <GatedNotice count={gatedCount} /> : null}
      <SettingsGroup title="提供方用量" action={action}>
        <View style={styles.blockList}>
          {payload.providers.map((usage) => (
            <ProviderBlock key={usage.providerId} usage={usage} />
          ))}
        </View>
      </SettingsGroup>
      <View style={styles.footer}>
        <ThemedInfo size={13} uniProps={mutedColorMapping} />
        <Text style={styles.footerText}>{updatedText}</Text>
      </View>
    </>
  );
}

// The "N providers can't report usage" banner shown above the list when any block is gated.
function GatedNotice({ count }: { count: number }) {
  return (
    <SettingsAlert
      tone="warning"
      icon={Info}
      title={`有 ${count} 个提供方暂不支持用量`}
      description="这些提供方所在主机版本较旧，未回传用量；升级后会自动显示，其余正常。"
    />
  );
}

// Refresh control for the providers group / empty state. Stateless: parent owns the dispatch.
function RefreshButton({ busy, onRefresh }: { busy: boolean; onRefresh: () => void }) {
  return (
    <SettingsButton
      label={busy ? "刷新中…" : "刷新"}
      icon={RefreshCw}
      variant="outline"
      small
      onPress={onRefresh}
      disabled={busy}
    />
  );
}

// One provider block: a bordered card with an icon + name + plan + status header, and a body
// that switches between gated empty / error note / meters+details. Gated blocks dim, never fake.
function ProviderBlock({ usage }: { usage: ProviderUsage }) {
  const status = useMemo(() => deriveProviderStatus(usage), [usage]);
  const cardStyle = useMemo(
    () => (usage.status === "unavailable" ? [styles.block, styles.blockGated] : styles.block),
    [usage.status],
  );
  return (
    <View style={cardStyle}>
      <View style={styles.blockHead}>
        <ThemedProviderGlyph providerId={usage.providerId} uniProps={mutedColorMapping} />
        <Text style={styles.blockName} numberOfLines={1}>
          {usage.displayName}
        </Text>
        {usage.planLabel ? <SettingsBadge label={usage.planLabel} /> : null}
        <View style={styles.flexSpacer} />
        <SettingsBadge label={status.label} tone={status.tone} icon={status.icon} />
      </View>
      <ProviderBlockBody usage={usage} />
    </View>
  );
}

// The provider block body. Gated → upgrade empty (no numbers). Otherwise → optional error note,
// balance readouts + window meters, detail rows, and a source/updated footer.
function ProviderBlockBody({ usage }: { usage: ProviderUsage }) {
  if (usage.status === "unavailable") {
    return (
      <View style={styles.blockBodySingle}>
        <SettingsEmpty message="这个提供方还没回传用量" />
      </View>
    );
  }

  const balances = usage.balances ?? [];
  const details = usage.details ?? [];
  const hasMeters = usage.windows.length > 0 || balances.length > 0;
  const showEmpty = !hasMeters && details.length === 0 && usage.status !== "error";

  return (
    <View style={styles.blockBody}>
      {usage.status === "error" && usage.error ? (
        <Text style={styles.errorText} numberOfLines={3}>
          {usage.error}
        </Text>
      ) : null}
      {hasMeters ? (
        <View style={styles.metersStack}>
          {balances.map((balance) => (
            <BalanceReadout key={balance.id} balance={balance} />
          ))}
          {usage.windows.map((window) => (
            <WindowMeter key={window.id} usageWindow={window} />
          ))}
        </View>
      ) : null}
      {details.length > 0 ? (
        <View style={styles.detailList}>
          {details.map((detail) => (
            <View key={detail.id} style={styles.detailRow}>
              <Text style={styles.detailLabel} numberOfLines={1}>
                {detail.label}
              </Text>
              <SettingsValue value={detail.value} />
            </View>
          ))}
        </View>
      ) : null}
      {showEmpty ? <SettingsEmpty message="暂无用量数据" /> : null}
      <ProviderFooter usage={usage} />
    </View>
  );
}

// Prominent balance headline (amount + caption) plus an optional used/limit meter.
function BalanceReadout({ balance }: { balance: ProviderUsageBalance }) {
  const model = useMemo(() => buildBalanceReadout(balance), [balance]);
  return (
    <View style={styles.balanceBox}>
      <View style={styles.balanceHead}>
        <Text style={styles.balanceAmount}>{model.primaryText}</Text>
        {model.caption ? <Text style={styles.balanceUnit}>{model.caption}</Text> : null}
      </View>
      {model.meter ? <UsageMeter meter={model.meter} /> : null}
    </View>
  );
}

// One usage window rendered as a meter (named usageWindow to avoid shadowing the DOM global).
function WindowMeter({ usageWindow }: { usageWindow: ProviderUsageWindow }) {
  const meter = useMemo(() => buildWindowMeter(usageWindow), [usageWindow]);
  return <UsageMeter meter={meter} />;
}

// A labeled thin bar: label + value on top, an optional tone-tinted fill (hidden when no
// percentage is known), and an optional reset/runs-out note. The fill width is the only
// dynamic style and is memoized on its inputs.
function UsageMeter({ meter }: { meter: MeterModel }) {
  const fillStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.barFill, FILL_TONE[meter.tone], { width: `${clampPct(meter.pct ?? 0)}%` }],
    [meter.tone, meter.pct],
  );
  const noteStyle = useMemo<StyleProp<TextStyle>>(
    () => [styles.meterNote, NOTE_TONE[meter.noteTone]],
    [meter.noteTone],
  );
  return (
    <View style={styles.meter}>
      <View style={styles.meterTop}>
        <Text style={styles.meterLabel} numberOfLines={1}>
          {meter.label}
        </Text>
        <Text style={styles.meterValue}>{meter.valueText}</Text>
      </View>
      {meter.pct != null ? (
        <View style={styles.barTrack}>
          <View style={fillStyle} />
        </View>
      ) : null}
      {meter.note ? <Text style={noteStyle}>{meter.note}</Text> : null}
    </View>
  );
}

// Source + last-updated line for a provider block; renders nothing when neither is known.
function ProviderFooter({ usage }: { usage: ProviderUsage }) {
  const text = useMemo(() => buildProviderFooter(usage), [usage]);
  if (!text) {
    return null;
  }
  return (
    <Text style={styles.blockFooter} numberOfLines={1}>
      {text}
    </Text>
  );
}

// Provider glyph wrapper so the per-provider icon picks up the muted theme color through
// withUnistyles (new code must not call useUnistyles()).
function ProviderGlyph({ providerId, color = "" }: { providerId: string; color?: string }) {
  const Icon = getProviderIcon(providerId);
  return <Icon size={16} color={color} />;
}
const ThemedProviderGlyph = withUnistyles(ProviderGlyph);
const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedInfo = withUnistyles(Info);

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const styles = StyleSheet.create((theme) => ({
  // full-screen loading box
  stateBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[8],
  },
  stateText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },

  retryWrap: {
    alignItems: "flex-start",
    marginTop: theme.spacing[2],
  },

  // provider block list + card
  blockList: {
    gap: theme.spacing[3],
  },
  block: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface0,
    overflow: "hidden",
  },
  blockGated: {
    opacity: 0.7,
  },
  blockHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  blockName: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  flexSpacer: {
    flex: 1,
  },
  blockBody: {
    padding: theme.spacing[4],
    gap: theme.spacing[4],
  },
  blockBodySingle: {
    padding: theme.spacing[4],
  },

  metersStack: {
    gap: theme.spacing[4],
  },

  // balance readout
  balanceBox: {
    gap: theme.spacing[2],
  },
  balanceHead: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  balanceAmount: {
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    letterSpacing: -0.5,
  },
  balanceUnit: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },

  // meter (thin bar)
  meter: {
    gap: 4,
  },
  meterTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  meterLabel: {
    flexShrink: 1,
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  meterValue: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
  },
  barTrack: {
    height: 4,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
    overflow: "hidden",
  },
  barFill: {
    height: 4,
    borderRadius: theme.borderRadius.full,
  },
  barFillDefault: {
    backgroundColor: theme.colors.accent,
  },
  barFillOk: {
    backgroundColor: theme.colors.statusSuccess,
  },
  barFillWarning: {
    backgroundColor: theme.colors.statusWarning,
  },
  barFillDanger: {
    backgroundColor: theme.colors.destructive,
  },
  meterNote: {
    fontSize: 11,
    lineHeight: 16,
    color: theme.colors.foregroundMuted,
  },
  meterNoteWarning: {
    color: theme.colors.statusWarning,
  },
  meterNoteDanger: {
    color: theme.colors.destructive,
  },

  // detail rows
  detailList: {
    gap: theme.spacing[1],
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  detailLabel: {
    flexShrink: 1,
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },

  errorText: {
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
    color: theme.colors.destructive,
  },

  blockFooter: {
    fontSize: 11,
    color: theme.colors.foregroundMuted,
  },

  // section footer
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  footerText: {
    fontSize: 11,
    color: theme.colors.foregroundMuted,
  },
}));

// Tone → fill/note style lookups, hoisted after `styles` so JSX never builds a fresh object.
const FILL_TONE: Record<ProviderUsageTone, StyleProp<ViewStyle>> = {
  default: styles.barFillDefault,
  ok: styles.barFillOk,
  warning: styles.barFillWarning,
  danger: styles.barFillDanger,
};
const NOTE_TONE: Record<ProviderUsageTone, StyleProp<TextStyle> | undefined> = {
  default: undefined,
  ok: undefined,
  warning: styles.meterNoteWarning,
  danger: styles.meterNoteDanger,
};
