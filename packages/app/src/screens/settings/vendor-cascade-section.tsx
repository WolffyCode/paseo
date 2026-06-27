import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Plus, Trash2 } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type {
  MutableDaemonConfig,
  MutableDaemonProviderConfig,
  VendorDiagnosis,
} from "@getpaseo/protocol/messages";
import type { ProviderVendor } from "@getpaseo/protocol/provider-config";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";
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

const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const dangerMapping = (theme: Theme) => ({ color: theme.colors.destructive });
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedChevronLeft = withUnistyles(ChevronLeft);
const ThemedPlus = withUnistyles(Plus);
const ThemedEye = withUnistyles(Eye);
const ThemedEyeOff = withUnistyles(EyeOff);
const ThemedTrash2 = withUnistyles(Trash2);
const ThemedSpinner = withUnistyles(LoadingSpinner);

const addVendorIcon = <ThemedPlus size={15} uniProps={mutedMapping} />;
const removeVendorIcon = <ThemedTrash2 size={15} uniProps={dangerMapping} />;
const discoverSpinner = <ThemedSpinner size={14} uniProps={mutedMapping} />;
const API_FORMATS = ["anthropic", "openai"] as const;

// 取某 provider 当前子树 → 跑模型层纯函数 → patch 回去。这是唯一结构化写路径(落盘 + 广播回显)。
type ProviderMutator = (
  providerId: string,
  fn: (provider: MutableDaemonProviderConfig) => MutableDaemonProviderConfig,
) => void;

// 中转站三级级联 UI（提供方→中转站→模型）。纯壳：导航走 cascadeReducer、派生走 selector、
// 标记/CRUD 走模型层纯函数 + useDaemonConfig().patchConfig，测速/拉模型走 daemon-client。
// deferred 控件（设当前/设默认/放出）照常可点 + 持久化回显，但绝不接 send（消费层 deferred）。
export function VendorCascadeSection({ serverId }: { serverId: string }) {
  const isConnected = useHostRuntimeIsConnected(serverId);
  const { config, patchConfig } = useDaemonConfig(serverId);
  const { entries } = useProvidersSnapshot(serverId);
  const [state, dispatch] = useReducer(cascadeReducer, initialCascadeState);

  // ProviderSnapshotEntry 结构上即 ProviderSnapshotLike，直接透传(不复制)。
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
      <SettingsSection title="模型与提供方">
        <View style={emptyCardStyle}>
          <Text style={styles.emptyText}>主机未连接，配置不可用</Text>
        </View>
      </SettingsSection>
    );
  }

  if (state.level === "L2") {
    return (
      <VendorListLevel
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
    return (
      <VendorDetailLevel
        serverId={serverId}
        config={config}
        providerId={state.providerId}
        vendorId={state.vendorId}
        onBack={handleBack}
        onMutate={mutateProvider}
      />
    );
  }

  const rows = selectL1Rows(config, snapshot);
  return (
    <SettingsSection title="模型与提供方">
      <View style={settingsStyles.card}>
        {rows.map((row, index) => (
          <ProviderRow
            key={row.providerId}
            row={row}
            showBorder={index > 0}
            onOpen={handleOpenProvider}
            onToggle={handleToggleProvider}
          />
        ))}
      </View>
    </SettingsSection>
  );
}

// L1 行：提供方 + 已装/中转站数/当前 vendor + 启停开关 + drill。稳定 handler、记忆化样式。
function ProviderRow({
  row,
  showBorder,
  onOpen,
  onToggle,
}: {
  row: L1ProviderRow;
  showBorder: boolean;
  onOpen: (providerId: string) => void;
  onToggle: (providerId: string, enabled: boolean) => void;
}) {
  const handleOpen = useCallback(() => onOpen(row.providerId), [onOpen, row.providerId]);
  const handleToggle = useCallback(
    (value: boolean) => onToggle(row.providerId, value),
    [onToggle, row.providerId],
  );
  const rowStyle = useMemo(
    () => [settingsStyles.row, showBorder && settingsStyles.rowBorder, styles.row],
    [showBorder],
  );
  return (
    <Pressable style={rowStyle} onPress={handleOpen} accessibilityRole="button">
      <ThemedChevronRight size={16} uniProps={mutedMapping} />
      <View style={styles.rowText}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {row.label}
        </Text>
        <Text style={settingsStyles.rowHint} numberOfLines={1}>
          {row.installed ? "已安装" : "未安装"} · 中转站 {row.vendorCount}
          {row.currentVendorLabel ? ` · 当前 ${row.currentVendorLabel}` : ""}
        </Text>
      </View>
      <Switch value={row.enabled} onValueChange={handleToggle} accessibilityLabel={row.label} />
    </Pressable>
  );
}

// L2：某提供方下的中转站列表 + 面包屑返回 + 新增 + drill 进详情。
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

  const handleAdd = useCallback(() => {
    const vendor: ProviderVendor = {
      id: `vendor_${Date.now().toString(36)}`,
      label: "新中转站",
      baseUrl: "",
      apiFormat: "anthropic",
    };
    onMutate(providerId, (provider) => addVendor(provider, vendor));
  }, [onMutate, providerId]);

  return (
    <View>
      <Breadcrumb label={view?.label ?? providerId} onBack={onBack} />
      <SettingsSection title="中转站">
        {view && view.vendors.length > 0 ? (
          <View style={settingsStyles.card}>
            {view.vendors.map((vendor, index) => (
              <VendorRow
                key={vendor.id}
                vendor={vendor}
                showBorder={index > 0}
                onOpen={onOpenVendor}
              />
            ))}
          </View>
        ) : (
          <View style={emptyCardStyle}>
            <Text style={styles.emptyText}>暂无中转站</Text>
          </View>
        )}
      </SettingsSection>
      <Button variant="outline" size="sm" leftIcon={addVendorIcon} onPress={handleAdd}>
        新增中转站
      </Button>
    </View>
  );
}

function VendorRow({
  vendor,
  showBorder,
  onOpen,
}: {
  vendor: VendorSummary;
  showBorder: boolean;
  onOpen: (vendorId: string) => void;
}) {
  const handleOpen = useCallback(() => onOpen(vendor.id), [onOpen, vendor.id]);
  const rowStyle = useMemo(
    () => [settingsStyles.row, showBorder && settingsStyles.rowBorder, styles.row],
    [showBorder],
  );
  return (
    <Pressable style={rowStyle} onPress={handleOpen} accessibilityRole="button">
      <View style={styles.rowText}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {vendor.label}
          {vendor.isCurrent ? "  ·  当前" : ""}
        </Text>
        <Text style={vendorUrlStyle} numberOfLines={1}>
          {vendor.baseUrl || "（未配置 base_url）"} · 放出 {vendor.modelCount}
        </Text>
      </View>
      <ThemedChevronRight size={16} uniProps={mutedMapping} />
    </Pressable>
  );
}

// L3：单个中转站详情 —— base_url/key/协议、测速、拉模型、放出/设默认、设当前、删除。全经模型层。
function VendorDetailLevel({
  serverId,
  config,
  providerId,
  vendorId,
  onBack,
  onMutate,
}: {
  serverId: string;
  config: MutableDaemonConfig;
  providerId: string;
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
  const toggleShowKey = useCallback(() => setShowKey((v) => !v), []);
  const setFormat = useCallback(
    (apiFormat: ProviderVendor["apiFormat"]) =>
      setDraft((d) => (d ? updateDraft(d, { apiFormat }) : d)),
    [],
  );

  const handleSave = useCallback(() => {
    if (!draft || !vendor) return;
    if (!validateDraft(draft).isValid) return;
    onMutate(providerId, (provider) =>
      updateVendor(provider, vendorId, applyDraftToVendor(draft, vendor)),
    );
  }, [draft, vendor, onMutate, providerId, vendorId]);

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
      // latest-wins：旧请求迟到结果不覆盖新结果
      if (!discoverSeq.current.isLatest(token)) return;
      if (payload.ok) {
        onMutate(providerId, (provider) =>
          updateVendor(provider, vendorId, {
            models: payload.models.map((m) => ({ id: m.id, label: m.label, source: "fetched" })),
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

  const discoverTrailing = useMemo(
    () => (
      <Button
        variant="ghost"
        size="sm"
        onPress={handleDiscover}
        disabled={busy !== null || !client}
      >
        {busy === "discover" ? discoverSpinner : "拉取列表"}
      </Button>
    ),
    [handleDiscover, busy, client],
  );

  if (!view || !vendor || !draft) {
    return (
      <View>
        <Breadcrumb label="中转站" onBack={onBack} />
        <View style={emptyCardStyle}>
          <Text style={styles.emptyText}>中转站不存在</Text>
        </View>
      </View>
    );
  }

  const validation = validateDraft(draft);
  const dirty = isDraftDirty(draft, vendor);

  return (
    <View>
      <Breadcrumb label={vendor.label} onBack={onBack} />

      <SettingsSection title="连接">
        <View style={settingsStyles.card}>
          <Field label="名称">
            <TextInput
              style={styles.input}
              value={draft.label}
              onChangeText={setLabel}
              placeholder="中转站名称"
            />
          </Field>
          <Field label="Base URL" error={validation.baseUrlError}>
            <TextInput
              style={inputMonoStyle}
              value={draft.baseUrl}
              onChangeText={setBaseUrl}
              placeholder="https://api.example.com"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </Field>
          <Field label="API Key" error={validation.apiKeyError}>
            <View style={styles.keyRow}>
              <TextInput
                style={keyInputStyle}
                value={draft.apiKey}
                onChangeText={setApiKey}
                placeholder="sk-..."
                secureTextEntry={!showKey}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable onPress={toggleShowKey} hitSlop={8} style={styles.eyeButton}>
                {showKey ? (
                  <ThemedEyeOff size={16} uniProps={mutedMapping} />
                ) : (
                  <ThemedEye size={16} uniProps={mutedMapping} />
                )}
              </Pressable>
            </View>
          </Field>
          <Field label="协议">
            <View style={styles.segments}>
              {API_FORMATS.map((fmt) => (
                <FormatSegment
                  key={fmt}
                  format={fmt}
                  active={draft.apiFormat === fmt}
                  onSelect={setFormat}
                />
              ))}
            </View>
          </Field>
        </View>
        <View style={styles.actionRow}>
          <Button
            variant="outline"
            size="sm"
            onPress={handleDiagnose}
            disabled={busy !== null || !client}
          >
            {busy === "diagnose" ? "测速中…" : "测速 / 测 Key"}
          </Button>
          <Button
            variant="default"
            size="sm"
            onPress={handleSave}
            disabled={!dirty || !validation.isValid}
          >
            保存
          </Button>
        </View>
        {diagnoses ? (
          <View style={diagCardStyle}>
            {diagnoses.map((d) => (
              <DiagnosisRow key={d.url} diagnosis={d} />
            ))}
          </View>
        ) : null}
      </SettingsSection>

      <SettingsSection title="放出模型" trailing={discoverTrailing}>
        {vendor.models && vendor.models.length > 0 ? (
          <View style={settingsStyles.card}>
            {vendor.models.map((model, index) => (
              <ModelRow
                key={model.id}
                modelId={model.id}
                label={model.label ?? model.id}
                showBorder={index > 0}
                exposed={vendor.exposedModelIds?.includes(model.id) ?? false}
                isDefault={vendor.defaultModelId === model.id}
                onToggleExposed={handleToggleExposed}
                onSetDefault={handleSetDefault}
              />
            ))}
          </View>
        ) : (
          <View style={emptyCardStyle}>
            <Text style={styles.emptyText}>暂无模型，点「拉取列表」发现</Text>
          </View>
        )}
      </SettingsSection>

      <View style={styles.footerActions}>
        <Button
          variant={view.isCurrent ? "secondary" : "outline"}
          size="sm"
          disabled={view.isCurrent}
          onPress={handleSetCurrent}
        >
          {view.isCurrent ? "当前中转站" : "设为当前"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          leftIcon={removeVendorIcon}
          textStyle={styles.dangerText}
          onPress={handleRemove}
        >
          删除中转站
        </Button>
      </View>
    </View>
  );
}

function FormatSegment({
  format,
  active,
  onSelect,
}: {
  format: ProviderVendor["apiFormat"];
  active: boolean;
  onSelect: (format: ProviderVendor["apiFormat"]) => void;
}) {
  const handlePress = useCallback(() => onSelect(format), [onSelect, format]);
  const segmentStyle = useMemo(() => [styles.segment, active && styles.segmentOn], [active]);
  const textStyle = useMemo(() => [styles.segmentText, active && styles.segmentTextOn], [active]);
  return (
    <Pressable style={segmentStyle} onPress={handlePress}>
      <Text style={textStyle}>{format}</Text>
    </Pressable>
  );
}

function ModelRow({
  modelId,
  label,
  showBorder,
  exposed,
  isDefault,
  onToggleExposed,
  onSetDefault,
}: {
  modelId: string;
  label: string;
  showBorder: boolean;
  exposed: boolean;
  isDefault: boolean;
  onToggleExposed: (modelId: string) => void;
  onSetDefault: (modelId: string) => void;
}) {
  const handleToggle = useCallback(() => onToggleExposed(modelId), [onToggleExposed, modelId]);
  const handleDefault = useCallback(() => onSetDefault(modelId), [onSetDefault, modelId]);
  const rowStyle = useMemo(
    () => [settingsStyles.row, showBorder && settingsStyles.rowBorder, styles.row],
    [showBorder],
  );
  const checkboxStyle = useMemo(() => [styles.checkbox, exposed && styles.checkboxOn], [exposed]);
  return (
    <View style={rowStyle}>
      <Pressable
        onPress={handleToggle}
        style={checkboxStyle}
        accessibilityRole="checkbox"
        accessibilityState={CHECKBOX_STATE[exposed ? "on" : "off"]}
      />
      <View style={styles.rowText}>
        <Text style={settingsStyles.rowTitle} numberOfLines={1}>
          {label}
        </Text>
        <Text style={modelIdStyle} numberOfLines={1}>
          {modelId}
        </Text>
      </View>
      <Button
        variant={isDefault ? "secondary" : "ghost"}
        size="sm"
        disabled={!exposed}
        onPress={handleDefault}
      >
        {isDefault ? "默认" : "设默认"}
      </Button>
    </View>
  );
}

function DiagnosisRow({ diagnosis }: { diagnosis: VendorDiagnosis }) {
  const healthStyle = useMemo(
    () => [styles.diagHealth, diagStyle(diagnosis.health)],
    [diagnosis.health],
  );
  return (
    <View style={styles.diagRow}>
      <Text style={diagUrlStyle} numberOfLines={1}>
        {diagnosis.url}
      </Text>
      <Text style={healthStyle}>
        {diagnosis.health}
        {diagnosis.latencyMs != null ? ` · ${diagnosis.latencyMs}ms` : ""}
      </Text>
    </View>
  );
}

function Breadcrumb({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <Pressable style={styles.crumb} onPress={onBack} accessibilityRole="button">
      <ThemedChevronLeft size={16} uniProps={mutedMapping} />
      <Text style={styles.crumbText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

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

function diagStyle(health: VendorDiagnosis["health"]) {
  if (health === "healthy") return styles.diagOk;
  if (health === "unauthorized" || health === "error") return styles.diagBad;
  return styles.diagWarn;
}

const CHECKBOX_STATE = { on: { checked: true }, off: { checked: false } } as const;
const EMPTY_SNAPSHOT: ProviderSnapshotLike[] = [];

const styles = StyleSheet.create((theme) => ({
  row: { gap: theme.spacing[3], minHeight: 56 },
  rowText: { flex: 1, minWidth: 0 },
  mono: { fontFamily: theme.fontFamily.mono },
  empty: { padding: theme.spacing[4], alignItems: "center" },
  emptyText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  crumb: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[2],
    marginBottom: theme.spacing[1],
  },
  crumbText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  field: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[1.5],
  },
  fieldLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: theme.colors.foreground,
  },
  fieldError: { fontSize: theme.fontSize.xs, color: theme.colors.destructive },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface0,
  },
  keyRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  eyeButton: { padding: theme.spacing[1] },
  segments: {
    flexDirection: "row",
    gap: theme.spacing[1],
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.md,
    padding: 2,
    alignSelf: "flex-start",
  },
  segment: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.base,
  },
  segmentOn: { backgroundColor: theme.colors.surface0 },
  segmentText: { fontSize: theme.fontSize.xs, color: theme.colors.foregroundMuted },
  segmentTextOn: { color: theme.colors.foreground, fontWeight: theme.fontWeight.semibold },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  footerActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    marginTop: theme.spacing[4],
  },
  dangerText: { color: theme.colors.destructive },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: theme.borderRadius.base,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
  },
  checkboxOn: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  diagCard: { marginTop: theme.spacing[2], padding: theme.spacing[3], gap: theme.spacing[2] },
  diagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  diagUrl: { flex: 1, fontSize: theme.fontSize.xs, color: theme.colors.foreground },
  diagHealth: { fontSize: theme.fontSize.xs },
  diagOk: { color: theme.colors.statusSuccess },
  diagBad: { color: theme.colors.statusDanger },
  diagWarn: { color: theme.colors.statusWarning },
}));

const emptyCardStyle = [settingsStyles.card, styles.empty];
const inputMonoStyle = [styles.input, styles.mono];
const keyInputStyle = [styles.input, styles.mono, { flex: 1 }];
const vendorUrlStyle = [settingsStyles.rowHint, styles.mono];
const modelIdStyle = [settingsStyles.rowHint, styles.mono];
const diagCardStyle = [settingsStyles.card, styles.diagCard];
const diagUrlStyle = [styles.mono, styles.diagUrl];
