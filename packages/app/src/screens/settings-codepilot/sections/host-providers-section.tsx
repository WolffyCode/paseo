// Host → Providers — the three-level cascade (L1 providers → L2 vendors/中转站 → L3
// vendor detail) re-skinned onto the codePilot settings kit. Pure presentation + dispatch:
// navigation runs through `cascadeReducer`, derived views through the cascade selectors,
// flag/CRUD writes through the cascade mutators + `useDaemonConfig().patchConfig`, and L3
// draft editing through `vendor-draft-model`. The model layer is reused unchanged from the
// legacy VendorCascadeSection; only the visual language moves to the kit.
//
// 对话接入暂缓 (design seam): set-current / set-default / expose-model persist into the
// provider config and echo back in settings, but do NOT drive the home composer yet — the
// chat-side consumption is deferred to the conversation project, per the approved design.
//
// TODO(i18n): cascade-specific copy is hardcoded zh-CN (no keys yet), matching the legacy
// cascade and the other migrated codePilot sections; only the section title reuses an
// existing key.
import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type {
  MutableDaemonConfig,
  MutableDaemonProviderConfig,
  VendorDiagnosis,
} from "@getpaseo/protocol/messages";
import type { ProviderVendor } from "@getpaseo/protocol/provider-config";
import { getProviderIcon } from "@/components/provider-icons";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import {
  addVendor,
  cascadeReducer,
  initialCascadeState,
  type L1ProviderRow,
  type ProviderSnapshotLike,
  removeVendor,
  selectL1Rows,
  selectL2View,
  selectL3View,
  setCurrentVendor,
  setProviderEnabled,
  setVendorDefaultModel,
  toggleVendorExposedModel,
  updateVendor,
  type VendorSummary,
} from "@/providers/vendor-cascade-model";
import {
  applyDraftToVendor,
  createRequestSequence,
  isDraftDirty,
  updateDraft,
  validateDraft,
  type VendorDraft,
  vendorToDraft,
} from "@/providers/vendor-draft-model";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";
import {
  SettingsAlert,
  SettingsBadge,
  SettingsButton,
  SettingsCard,
  SettingsDetail,
  SettingsEmpty,
  SettingsGroup,
  SettingsSegmented,
  SettingsStatusDot,
  SettingsToggle,
  SettingsValue,
} from "../primitives";
import { settingsKit } from "../styles";

// The single structured write path for one provider subtree: read current config → run a
// cascade mutator → patch it back (which optimistically updates the query cache + broadcasts).
type ProviderMutator = (
  providerId: string,
  fn: (provider: MutableDaemonProviderConfig) => MutableDaemonProviderConfig,
) => void;

const SUBTITLE_L1 =
  "为这台主机配置提供方 →（下钻）中转站（base_url + key 的 API 供应商）→ 放出模型。中转站 ≠「主机」段的 relay 远程连接。";
const SUBTITLE_L2 =
  "配置该提供方名下的中转站（base_url + key 的 API 供应商）。点中转站卡片下钻详情。";
const SUBTITLE_L3 =
  "base_url + key 的 API 供应商（中转站）。设置连接、测速与放出到对话选型的模型。";

// apiFormat dispatches on protocol (anthropic/openai), not brand name — see provider-config.
const API_FORMAT_OPTIONS: { id: ProviderVendor["apiFormat"]; label: string }[] = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
];

// A shared empty snapshot so a host without a live providers snapshot doesn't allocate per render.
const EMPTY_SNAPSHOT: ProviderSnapshotLike[] = [];

// Endpoint-diagnosis presentation lookups (no nested ternaries in the row).
const DIAGNOSIS_DOT: Record<VendorDiagnosis["health"], "on" | "off" | "idle"> = {
  healthy: "on",
  unauthorized: "off",
  error: "off",
  unreachable: "off",
  timeout: "idle",
};
const DIAGNOSIS_TONE: Record<VendorDiagnosis["health"], "default" | "warn" | "danger"> = {
  healthy: "default",
  unauthorized: "danger",
  error: "danger",
  unreachable: "danger",
  timeout: "warn",
};
const DIAGNOSIS_LABEL: Record<VendorDiagnosis["health"], string> = {
  healthy: "健康",
  unauthorized: "未授权",
  error: "错误",
  unreachable: "不可达",
  timeout: "超时",
};

// Icon theming without `useUnistyles()` (banned): wrap the lucide leaf with `withUnistyles`
// and feed the color through `uniProps`, exactly like the legacy cascade.
const iconMuted = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const iconForeground = (theme: Theme) => ({ color: theme.colors.foreground });
const iconOnAccent = (theme: Theme) => ({ color: theme.colors.accentForeground ?? "#ffffff" });
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedChevronLeft = withUnistyles(ChevronLeft);
const ThemedEye = withUnistyles(Eye);
const ThemedEyeOff = withUnistyles(EyeOff);
const ThemedCheck = withUnistyles(Check);

// The Providers detail pane. Owns the host config + providers snapshot + cascade navigation,
// and renders exactly one level (L1/L2/L3). Offline / no-config short-circuits to a callout.
export function HostProvidersSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const isConnected = useHostRuntimeIsConnected(serverId);
  const { config, patchConfig } = useDaemonConfig(serverId);
  const { entries } = useProvidersSnapshot(serverId);
  const [state, dispatch] = useReducer(cascadeReducer, initialCascadeState);

  // ProviderSnapshotEntry is structurally a ProviderSnapshotLike — pass through, don't copy.
  const snapshot = useMemo<ProviderSnapshotLike[]>(() => entries ?? EMPTY_SNAPSHOT, [entries]);

  const mutateProvider = useCallback<ProviderMutator>(
    (providerId, fn) => {
      const current: MutableDaemonProviderConfig = config?.providers?.[providerId] ?? {};
      void patchConfig({ providers: { [providerId]: fn(current) } }).catch((error) => {
        Alert.alert("无法保存", error instanceof Error ? error.message : String(error));
      });
    },
    [config, patchConfig],
  );

  const handleOpenProvider = useCallback(
    (providerId: string) => dispatch({ type: "drillToProvider", providerId }),
    [],
  );
  const handleToggleProvider = useCallback(
    (providerId: string, enabled: boolean) =>
      mutateProvider(providerId, (provider) => setProviderEnabled(provider, enabled)),
    [mutateProvider],
  );
  const handleBack = useCallback(() => dispatch({ type: "back" }), []);
  const handleOpenVendor = useCallback(
    (vendorId: string) => dispatch({ type: "drillToVendor", vendorId }),
    [],
  );

  if (!isConnected || !config) {
    return (
      <SettingsDetail title={t("settings.hostSections.providers")} subtitle={SUBTITLE_L1}>
        <SettingsAlert
          tone="warning"
          icon={AlertTriangle}
          title="主机离线 · 配置不可用"
          description="连接到这台主机后即可查看与编辑提供方、中转站与放出模型。"
        />
      </SettingsDetail>
    );
  }

  if (state.level === "L2") {
    return (
      <VendorListLevel
        key={state.providerId}
        config={config}
        snapshot={snapshot}
        providerId={state.providerId}
        onBack={handleBack}
        onOpenVendor={handleOpenVendor}
        onMutate={mutateProvider}
      />
    );
  }

  if (state.level === "L3") {
    const providerLabel =
      selectL2View(config, snapshot, state.providerId)?.label ?? state.providerId;
    return (
      <VendorDetailLevel
        key={state.vendorId}
        serverId={serverId}
        config={config}
        providerId={state.providerId}
        providerLabel={providerLabel}
        vendorId={state.vendorId}
        onBack={handleBack}
        onMutate={mutateProvider}
      />
    );
  }

  return (
    <ProviderListLevel
      config={config}
      snapshot={snapshot}
      onOpenProvider={handleOpenProvider}
      onToggleProvider={handleToggleProvider}
    />
  );
}

// L1 — the provider list: 5 builtins + catalog-added ACP, each a drill row with a CLI-install
// badge, model/vendor counts and an enable toggle. Empty only when the snapshot is unavailable.
function ProviderListLevel({
  config,
  snapshot,
  onOpenProvider,
  onToggleProvider,
}: {
  config: MutableDaemonConfig;
  snapshot: ProviderSnapshotLike[];
  onOpenProvider: (providerId: string) => void;
  onToggleProvider: (providerId: string, enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const rows = selectL1Rows(config, snapshot);
  return (
    <SettingsDetail title={t("settings.hostSections.providers")} subtitle={SUBTITLE_L1}>
      <SettingsAlert
        tone="info"
        icon={Layers}
        title="三级：提供方 → 中转站 → 模型"
        description="提供方 = 内置 5 + 从目录新增的 ACP（启用 / 停用）。中转站 = 该提供方下 base_url + key 的 API 供应商，≠ relay 远程（远程连接在「主机」段）。"
      />
      {rows.length === 0 ? (
        <SettingsGroup title="提供方">
          <SettingsEmpty message="正在加载提供方，或这台主机暂不支持提供方快照。" />
        </SettingsGroup>
      ) : (
        <SettingsGroup title="提供方">
          <SettingsCard>
            {rows.map((row, index) => (
              <ProviderRow
                key={row.providerId}
                row={row}
                divider={index > 0}
                onOpen={onOpenProvider}
                onToggle={onToggleProvider}
              />
            ))}
          </SettingsCard>
        </SettingsGroup>
      )}
    </SettingsDetail>
  );
}

// One L1 row: glyph + name + CLI badge + meta on a pressable body (drills to L2), with the
// enable toggle as a sibling so its tap never bubbles into a drill. Toggle is disabled when
// the agent CLI is not installed (design: open the toggle only after installing).
function ProviderRow({
  row,
  divider,
  onOpen,
  onToggle,
}: {
  row: L1ProviderRow;
  divider: boolean;
  onOpen: (providerId: string) => void;
  onToggle: (providerId: string, enabled: boolean) => void;
}) {
  const handleOpen = useCallback(() => onOpen(row.providerId), [onOpen, row.providerId]);
  const handleToggle = useCallback(
    (next: boolean) => onToggle(row.providerId, next),
    [onToggle, row.providerId],
  );
  const rowStyle = useMemo(
    () => (divider ? [settingsKit.row, settingsKit.rowDivider] : settingsKit.row),
    [divider],
  );
  const currentSuffix = row.currentVendorLabel ? ` · 当前 ${row.currentVendorLabel}` : "";
  const metaText = `${row.modelCount} 个模型 · 中转站 ${row.vendorCount}${currentSuffix}`;
  return (
    <View style={rowStyle}>
      <Pressable style={styles.provBody} onPress={handleOpen} accessibilityRole="button">
        <ProviderGlyph providerId={row.providerId} size={20} />
        <View style={styles.provText}>
          <View style={styles.provNameRow}>
            <Text style={settingsKit.rowLabelText} numberOfLines={1}>
              {row.label}
            </Text>
            {row.installed ? (
              <SettingsBadge label="CLI 已安装" tone="success" icon={Check} />
            ) : (
              <SettingsBadge label="CLI 未安装" tone="warning" icon={AlertTriangle} />
            )}
          </View>
          <Text style={styles.provMeta} numberOfLines={1}>
            {metaText}
          </Text>
        </View>
        <ThemedChevronRight size={16} uniProps={iconMuted} />
      </Pressable>
      <SettingsToggle value={row.enabled} onChange={handleToggle} disabled={!row.installed} />
    </View>
  );
}

// The provider brand glyph, themed to the foreground token. `withUnistyles` is applied once
// per providerId (memoized) so wrapping doesn't churn on every render.
function ProviderGlyph({ providerId, size }: { providerId: string; size: number }) {
  const Glyph = useMemo(() => withUnistyles(getProviderIcon(providerId)), [providerId]);
  return <Glyph size={size} uniProps={iconForeground} />;
}

// L2 — the vendor list for one provider: breadcrumb back + a stack of vendor cards + an
// "新增中转站" action. New vendors append at the end with a blank base_url draft.
function VendorListLevel({
  config,
  snapshot,
  providerId,
  onBack,
  onOpenVendor,
  onMutate,
}: {
  config: MutableDaemonConfig;
  snapshot: ProviderSnapshotLike[];
  providerId: string;
  onBack: () => void;
  onOpenVendor: (vendorId: string) => void;
  onMutate: ProviderMutator;
}) {
  const view = selectL2View(config, snapshot, providerId);
  const vendorCount = view?.vendors.length ?? 0;

  const handleAdd = useCallback(() => {
    const vendor: ProviderVendor = {
      id: `vendor_${Date.now().toString(36)}`,
      label: "新中转站",
      baseUrl: "",
      apiFormat: "anthropic",
      order: vendorCount,
    };
    onMutate(providerId, (provider) => addVendor(provider, vendor));
  }, [onMutate, providerId, vendorCount]);

  const addButton = useMemo(
    () => (
      <SettingsButton label="新增中转站" icon={Plus} variant="primary" small onPress={handleAdd} />
    ),
    [handleAdd],
  );
  const label = view?.label ?? providerId;
  const groupTitle = `中转站 · ${vendorCount}`;

  return (
    <SettingsDetail title={label} subtitle={SUBTITLE_L2}>
      <Breadcrumb label="返回提供方" onBack={onBack} />
      {vendorCount > 0 ? (
        <SettingsGroup title={groupTitle} action={addButton}>
          <View style={styles.vendorList}>
            {view?.vendors.map((vendor) => (
              <VendorCard key={vendor.id} vendor={vendor} onOpen={onOpenVendor} />
            ))}
          </View>
        </SettingsGroup>
      ) : (
        <SettingsGroup title="中转站" action={addButton}>
          <SettingsEmpty
            message={`${label} 还没有中转站 · 接入第一个 base_url + key 的 API 供应商`}
          />
        </SettingsGroup>
      )}
    </SettingsDetail>
  );
}

// One L2 vendor card (pressable → drills to L3). The current vendor reads as accent border +
// tinted surface + a "当前" badge; meta shows base_url and exposed-model count.
function VendorCard({
  vendor,
  onOpen,
}: {
  vendor: VendorSummary;
  onOpen: (vendorId: string) => void;
}) {
  const handleOpen = useCallback(() => onOpen(vendor.id), [onOpen, vendor.id]);
  const cardStyle = useMemo(
    () => (vendor.isCurrent ? [styles.vendorCard, styles.vendorCardActive] : styles.vendorCard),
    [vendor.isCurrent],
  );
  const urlText = vendor.baseUrl || "（未配置 base_url）";
  return (
    <Pressable style={cardStyle} onPress={handleOpen} accessibilityRole="button">
      <View style={styles.vendorTop}>
        <Text style={styles.vendorName} numberOfLines={1}>
          {vendor.label}
        </Text>
        {vendor.isCurrent ? <SettingsBadge label="当前" tone="success" icon={Check} /> : null}
        <ThemedChevronRight size={14} uniProps={iconMuted} />
      </View>
      <Text style={styles.vendorUrl} numberOfLines={1}>
        {urlText}
      </Text>
      <Text style={styles.vendorMeta} numberOfLines={1}>
        放出 {vendor.modelCount} 模型
      </Text>
    </Pressable>
  );
}

// L3 — a single vendor's detail. Connection (name / base_url / key / protocol) edits flow
// through a draft buffer with validation + dirty tracking; 测速 / 拉取列表 hit the daemon
// client; expose / set-default / set-current and delete go through the cascade mutators.
function VendorDetailLevel({
  serverId,
  config,
  providerId,
  providerLabel,
  vendorId,
  onBack,
  onMutate,
}: {
  serverId: string;
  config: MutableDaemonConfig;
  providerId: string;
  providerLabel: string;
  vendorId: string;
  onBack: () => void;
  onMutate: ProviderMutator;
}) {
  const client = useHostRuntimeClient(serverId);
  const view = selectL3View(config, providerId, vendorId);
  const vendor = view?.vendor;

  const [draft, setDraft] = useState<VendorDraft | null>(vendor ? vendorToDraft(vendor) : null);
  const [showKey, setShowKey] = useState(false);
  const [diagnoses, setDiagnoses] = useState<VendorDiagnosis[] | null>(null);
  const [busy, setBusy] = useState<"diagnose" | "discover" | null>(null);
  const discoverSeq = useRef(createRequestSequence());

  const setLabel = useCallback(
    (label: string) => setDraft((d) => (d ? updateDraft(d, { label }) : d)),
    [],
  );
  const setBaseUrl = useCallback(
    (baseUrl: string) => setDraft((d) => (d ? updateDraft(d, { baseUrl }) : d)),
    [],
  );
  const setApiKey = useCallback(
    (apiKey: string) => setDraft((d) => (d ? updateDraft(d, { apiKey }) : d)),
    [],
  );
  const setFormat = useCallback(
    (apiFormat: ProviderVendor["apiFormat"]) =>
      setDraft((d) => (d ? updateDraft(d, { apiFormat }) : d)),
    [],
  );
  const toggleShowKey = useCallback(() => setShowKey((v) => !v), []);

  const handleSave = useCallback(() => {
    if (!draft || !vendor) return;
    if (!validateDraft(draft).isValid) return;
    onMutate(providerId, (provider) =>
      updateVendor(provider, vendorId, applyDraftToVendor(draft, vendor)),
    );
  }, [draft, vendor, onMutate, providerId, vendorId]);

  // 测速 / 测 Key: diagnose the base_url endpoint and surface per-endpoint health.
  const handleDiagnose = useCallback(async () => {
    if (!client || !draft || draft.baseUrl.trim() === "") return;
    setBusy("diagnose");
    try {
      const payload = await client.diagnoseVendor({
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey || undefined,
        apiFormat: draft.apiFormat,
        endpoints: [draft.baseUrl],
      });
      setDiagnoses(payload.results);
    } catch (error) {
      Alert.alert("测速失败", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }, [client, draft]);

  // 拉取列表: discover models from base_url; latest-wins guard drops stale responses.
  const handleDiscover = useCallback(async () => {
    if (!client || !draft || draft.baseUrl.trim() === "") return;
    const token = discoverSeq.current.issue();
    setBusy("discover");
    try {
      const payload = await client.discoverVendorModels({
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey || undefined,
        apiFormat: draft.apiFormat,
      });
      if (!discoverSeq.current.isLatest(token)) return;
      if (payload.ok) {
        onMutate(providerId, (provider) =>
          updateVendor(provider, vendorId, {
            models: payload.models.map((model) => ({
              id: model.id,
              label: model.label,
              source: "fetched",
            })),
            modelsFetchedAt: payload.fetchedAt,
          }),
        );
      } else {
        Alert.alert("拉取模型失败", payload.error.code);
      }
    } catch (error) {
      Alert.alert("拉取模型失败", error instanceof Error ? error.message : String(error));
    } finally {
      if (discoverSeq.current.isLatest(token)) setBusy(null);
    }
  }, [client, draft, onMutate, providerId, vendorId]);

  const handleSetCurrent = useCallback(
    () => onMutate(providerId, (provider) => setCurrentVendor(provider, vendorId)),
    [onMutate, providerId, vendorId],
  );
  const handleRemove = useCallback(() => {
    onMutate(providerId, (provider) => removeVendor(provider, vendorId));
    onBack();
  }, [onMutate, providerId, vendorId, onBack]);
  const handleToggleExposed = useCallback(
    (modelId: string) =>
      onMutate(providerId, (provider) => toggleVendorExposedModel(provider, vendorId, modelId)),
    [onMutate, providerId, vendorId],
  );
  const handleSetDefault = useCallback(
    (modelId: string) =>
      onMutate(providerId, (provider) => setVendorDefaultModel(provider, vendorId, modelId)),
    [onMutate, providerId, vendorId],
  );

  const baseUrlEmpty = !draft || draft.baseUrl.trim() === "";
  const probeDisabled = busy !== null || !client || baseUrlEmpty;
  const discoverButton = useMemo(
    () => (
      <SettingsButton
        label={busy === "discover" ? "拉取中…" : "拉取列表"}
        icon={RefreshCw}
        variant="outline"
        small
        onPress={handleDiscover}
        disabled={probeDisabled}
      />
    ),
    [busy, handleDiscover, probeDisabled],
  );

  if (!view || !vendor || !draft) {
    return (
      <SettingsDetail title="中转站" subtitle={SUBTITLE_L3}>
        <Breadcrumb label={`返回 ${providerLabel}`} onBack={onBack} />
        <SettingsEmpty message="中转站不存在或已被移除。" />
      </SettingsDetail>
    );
  }

  const validation = validateDraft(draft);
  const dirty = isDraftDirty(draft, vendor);
  const exposedCount = vendor.exposedModelIds?.length ?? 0;
  const totalModels = vendor.models?.length ?? 0;
  const modelsGroupTitle = `放出模型 · ${exposedCount} / ${totalModels}`;
  const setCurrentLabel = view.isCurrent ? "已是当前中转站" : "设为当前";

  return (
    <SettingsDetail title={vendor.label} subtitle={SUBTITLE_L3}>
      <Breadcrumb label={`返回 ${providerLabel}`} onBack={onBack} />
      <View style={styles.l3StatusRow}>
        {view.isCurrent ? <SettingsBadge label="当前" tone="success" icon={Check} /> : null}
        <SettingsBadge label={draft.apiFormat} tone="muted" />
      </View>
      <SettingsAlert
        tone="info"
        icon={Layers}
        title="这页决定对话框里能用什么（对话接入 · 暂缓）"
        description="下面「放出模型」勾选 +「设为当前」决定 home 对话框 composer 的中转站 / 模型下拉。本期出 UI + 配置 schema，不接对话流。"
      />

      <SettingsGroup title="连接">
        <SettingsCard padded>
          <Field label="名称">
            <TextField value={draft.label} onChangeText={setLabel} placeholder="中转站名称" />
          </Field>
          <Field label="请求地址 base_url" error={validation.baseUrlError}>
            <TextField
              value={draft.baseUrl}
              onChangeText={setBaseUrl}
              placeholder="https://api.example.com"
              mono
              error={Boolean(validation.baseUrlError)}
            />
          </Field>
          <Field label="API Key" error={validation.apiKeyError}>
            <PasswordField
              value={draft.apiKey}
              onChangeText={setApiKey}
              visible={showKey}
              onToggleVisible={toggleShowKey}
              error={Boolean(validation.apiKeyError)}
            />
          </Field>
          <Field label="协议">
            <SettingsSegmented
              options={API_FORMAT_OPTIONS}
              value={draft.apiFormat}
              onChange={setFormat}
            />
          </Field>
        </SettingsCard>
        <View style={styles.actionRow}>
          <SettingsButton
            label={busy === "diagnose" ? "测速中…" : "测速 / 测 Key"}
            icon={Zap}
            variant="outline"
            small
            onPress={handleDiagnose}
            disabled={probeDisabled}
          />
          <SettingsButton
            label="保存"
            variant="primary"
            small
            onPress={handleSave}
            disabled={!dirty || !validation.isValid}
          />
        </View>
      </SettingsGroup>

      {diagnoses ? (
        <SettingsGroup title="端点测速">
          <SettingsCard>
            {diagnoses.map((diagnosis, index) => (
              <DiagnosisRow key={diagnosis.url} diagnosis={diagnosis} divider={index > 0} />
            ))}
          </SettingsCard>
        </SettingsGroup>
      ) : null}

      <SettingsGroup title={modelsGroupTitle} action={discoverButton}>
        {totalModels > 0 ? (
          <SettingsCard>
            {vendor.models?.map((model, index) => (
              <ModelRow
                key={model.id}
                modelId={model.id}
                label={model.label ?? model.id}
                divider={index > 0}
                exposed={vendor.exposedModelIds?.includes(model.id) ?? false}
                isDefault={vendor.defaultModelId === model.id}
                onToggleExposed={handleToggleExposed}
                onSetDefault={handleSetDefault}
              />
            ))}
          </SettingsCard>
        ) : (
          <SettingsEmpty message="暂无模型 · 点「拉取列表」从 base_url 发现，或在 config.json 手动添加。" />
        )}
      </SettingsGroup>

      <View style={styles.footer}>
        <SettingsButton
          label={setCurrentLabel}
          icon={Check}
          variant="outline"
          small
          onPress={handleSetCurrent}
          disabled={view.isCurrent}
        />
        <SettingsButton
          label="删除中转站"
          icon={Trash2}
          variant="danger"
          small
          onPress={handleRemove}
        />
      </View>
    </SettingsDetail>
  );
}

// One exposed-model row: a checkbox toggles exposure, "设默认" marks the composer's initial
// model (disabled until exposed). Off rows dim. 对话接入暂缓: persists but doesn't drive chat.
function ModelRow({
  modelId,
  label,
  divider,
  exposed,
  isDefault,
  onToggleExposed,
  onSetDefault,
}: {
  modelId: string;
  label: string;
  divider: boolean;
  exposed: boolean;
  isDefault: boolean;
  onToggleExposed: (modelId: string) => void;
  onSetDefault: (modelId: string) => void;
}) {
  const handleToggle = useCallback(() => onToggleExposed(modelId), [onToggleExposed, modelId]);
  const handleDefault = useCallback(() => onSetDefault(modelId), [onSetDefault, modelId]);
  const rowStyle = useMemo(
    () => [
      settingsKit.row,
      divider && settingsKit.rowDivider,
      styles.modelRow,
      !exposed && styles.modelRowOff,
    ],
    [divider, exposed],
  );
  const defaultLabel = isDefault ? "默认" : "设默认";
  return (
    <View style={rowStyle}>
      <Checkbox checked={exposed} onPress={handleToggle} label={label} />
      <View style={styles.modelText}>
        <View style={styles.modelNameRow}>
          <Text style={settingsKit.rowLabelText} numberOfLines={1}>
            {label}
          </Text>
          {isDefault ? <SettingsBadge label="默认" tone="success" /> : null}
        </View>
        <Text style={styles.modelId} numberOfLines={1}>
          {modelId}
        </Text>
      </View>
      <SettingsButton
        label={defaultLabel}
        variant="ghost"
        small
        onPress={handleDefault}
        disabled={!exposed || isDefault}
      />
    </View>
  );
}

// One endpoint-diagnosis result: status dot + url on the left, health + latency value on the
// right (color via the lookup tables — no nested ternaries).
function DiagnosisRow({ diagnosis, divider }: { diagnosis: VendorDiagnosis; divider: boolean }) {
  const rowStyle = useMemo(
    () => (divider ? [settingsKit.row, settingsKit.rowDivider] : settingsKit.row),
    [divider],
  );
  const healthLabel = DIAGNOSIS_LABEL[diagnosis.health];
  const valueText =
    diagnosis.latencyMs != null ? `${healthLabel} · ${diagnosis.latencyMs}ms` : healthLabel;
  return (
    <View style={rowStyle}>
      <View style={settingsKit.rowLeft}>
        <View style={settingsKit.rowLabel}>
          <SettingsStatusDot status={DIAGNOSIS_DOT[diagnosis.health]} />
          <Text style={styles.epUrl} numberOfLines={1}>
            {diagnosis.url}
          </Text>
        </View>
      </View>
      <SettingsValue value={valueText} tone={DIAGNOSIS_TONE[diagnosis.health]} />
    </View>
  );
}

// A back-link breadcrumb above a drilled level (Esc-equivalent affordance).
function Breadcrumb({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <Pressable style={styles.crumb} onPress={onBack} accessibilityRole="button">
      <ThemedChevronLeft size={16} uniProps={iconMuted} />
      <Text style={styles.crumbText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// A stacked field: label above the control, with an optional inline error line beneath.
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

// A single-line text input (kit has none). Focus tints the border accent; `error` tints it red.
function TextField({
  value,
  onChangeText,
  placeholder,
  mono,
  error,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  mono?: boolean;
  error?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);
  const style = useMemo(
    () => [
      styles.input,
      mono && styles.inputMono,
      focused && styles.inputFocused,
      error && styles.inputError,
    ],
    [mono, focused, error],
  );
  return (
    <TextInput
      style={style}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      onFocus={handleFocus}
      onBlur={handleBlur}
      autoCapitalize="none"
      autoCorrect={false}
    />
  );
}

// A masked key input with an inline eye toggle for plaintext/masked (kit has none).
function PasswordField({
  value,
  onChangeText,
  visible,
  onToggleVisible,
  error,
}: {
  value: string;
  onChangeText: (next: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
  error?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);
  const wrapStyle = useMemo(
    () => [styles.pwdWrap, focused && styles.inputFocused, error && styles.inputError],
    [focused, error],
  );
  return (
    <View style={wrapStyle}>
      <TextInput
        style={styles.pwdInput}
        value={value}
        onChangeText={onChangeText}
        placeholder="sk-..."
        secureTextEntry={!visible}
        onFocus={handleFocus}
        onBlur={handleBlur}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Pressable
        style={styles.eye}
        onPress={onToggleVisible}
        hitSlop={8}
        accessibilityRole="button"
      >
        {visible ? (
          <ThemedEyeOff size={16} uniProps={iconMuted} />
        ) : (
          <ThemedEye size={16} uniProps={iconMuted} />
        )}
      </Pressable>
    </View>
  );
}

// A square checkbox (kit has none): accent fill + white check when on, hollow when off.
function Checkbox({
  checked,
  onPress,
  label,
}: {
  checked: boolean;
  onPress: () => void;
  label: string;
}) {
  const a11yState = useMemo(() => ({ checked }), [checked]);
  const style = useMemo(
    () => (checked ? [styles.checkbox, styles.checkboxOn] : styles.checkbox),
    [checked],
  );
  return (
    <Pressable
      style={style}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={a11yState}
      accessibilityLabel={label}
    >
      {checked ? <ThemedCheck size={12} uniProps={iconOnAccent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  // L1 provider row
  provBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  provText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  provNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  provMeta: {
    fontSize: 12.5,
    color: theme.colors.foregroundMuted,
  },

  // L2 vendor list / card
  vendorList: {
    gap: theme.spacing[2],
  },
  vendorCard: {
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    gap: theme.spacing[1],
  },
  vendorCardActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface1,
  },
  vendorTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  vendorName: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  vendorUrl: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
    color: theme.colors.foregroundMuted,
  },
  vendorMeta: {
    fontSize: 12.5,
    color: theme.colors.foregroundMuted,
  },

  // breadcrumb
  crumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    alignSelf: "flex-start",
  },
  crumbText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },

  // L3 status badges row
  l3StatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },

  // L3 fields + inputs
  field: {
    gap: theme.spacing[1.5],
  },
  fieldLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  fieldError: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.destructive,
  },
  input: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: 11,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
  },
  inputMono: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
  },
  inputFocused: {
    borderColor: theme.colors.accent,
  },
  inputError: {
    borderColor: theme.colors.destructive,
  },
  pwdWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingLeft: 11,
    paddingRight: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface0,
  },
  pwdInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.fontFamily.mono,
    fontSize: 13,
    color: theme.colors.foreground,
    paddingVertical: 9,
  },
  eye: {
    padding: 3,
    borderRadius: theme.borderRadius.base,
  },

  // L3 action rows
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  epUrl: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
    color: theme.colors.foreground,
  },

  // L3 model rows
  modelRow: {
    gap: theme.spacing[3],
  },
  modelRowOff: {
    opacity: 0.5,
  },
  modelText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  modelNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  modelId: {
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
    color: theme.colors.foregroundMuted,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: theme.borderRadius.base,
    borderWidth: 1.5,
    borderColor: theme.colors.surface4,
    backgroundColor: theme.colors.surface0,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
}));
