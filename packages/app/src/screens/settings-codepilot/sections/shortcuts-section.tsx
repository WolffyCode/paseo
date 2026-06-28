// Shortcuts — the rebindable keyboard-shortcut settings section, re-skinned onto the
// codePilot kit. Pure re-skin: every bit of capture/persistence wiring is reused from the
// legacy section — the pure `captureReducer` owns all transitions, the overrides hook owns
// persistence, and this component only translates DOM key events into machine events and
// renders model-derived state. Desktop-only: native has no hardware keyboard, so it shows
// an unavailable note instead.
import { Fragment, useCallback, useEffect, useMemo, useReducer } from "react";
import { Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { Pencil, RotateCcw, Smartphone } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { isWeb } from "@/constants/platform";
import { getIsElectronRuntime } from "@/constants/layout";
import { useKeyboardShortcutOverrides } from "@/hooks/use-keyboard-shortcut-overrides";
import {
  buildKeyboardShortcutHelpSections,
  getBindingIdForAction,
  type KeyboardShortcutHelpRow,
  type KeyboardShortcutHelpSection,
} from "@/keyboard/keyboard-shortcuts";
import {
  canSaveCapture,
  capturedComboString,
  captureReducer,
  type CaptureState,
  IDLE_CAPTURE_STATE,
} from "@/keyboard/shortcut-capture-machine";
import {
  chordStringToShortcutKeys,
  comboStringToShortcutKeys,
  heldModifiersFromEvent,
  keyboardEventToComboString,
} from "@/keyboard/shortcut-string";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import type { ShortcutKey } from "@/utils/format-shortcut";
import { formatShortcut } from "@/utils/format-shortcut";
import { getShortcutOs } from "@/utils/shortcut-platform";
import {
  SettingsAlert,
  SettingsButton,
  SettingsCard,
  SettingsDetail,
  SettingsGroup,
} from "../primitives";
import { settingsKit } from "../styles";

// Stable empty reference so non-capturing rows never re-render from a fresh array.
const EMPTY_CAPTURED_COMBOS: string[] = [];

// Renders a chord as individual GitHub-style keycaps; `tone` tints the recording echo
// (accent border + accent glyphs) apart from the resting default.
function Keycaps({ combos, tone }: { combos: ShortcutKey[][]; tone: "default" | "recording" }) {
  const os = getShortcutOs();
  const capStyle = tone === "recording" ? RECORDING_CAP : RESTING_CAP;
  return (
    <View style={styles.keycaps}>
      {combos.map((combo) => (
        <Fragment key={combo.join("+")}>
          {combo.map((key) => (
            <Text key={key} style={capStyle}>
              {formatShortcut([key], os)}
            </Text>
          ))}
        </Fragment>
      ))}
    </View>
  );
}

// The live capture echo: a prompt while nothing is captured, else the captured chord
// (plus any held-only modifiers) as recording-tinted keycaps — mirrors the legacy
// ShortcutSequence so the FSM stays the single source of capture truth.
function CaptureDisplay({
  capturedCombos,
  heldModifiers,
}: {
  capturedCombos: string[];
  heldModifiers: string | null;
}) {
  const { t } = useTranslation();
  const combos = useMemo(() => {
    const list = capturedCombos.map(comboStringToShortcutKeys);
    if (heldModifiers) {
      list.push(comboStringToShortcutKeys(heldModifiers));
    }
    return list;
  }, [capturedCombos, heldModifiers]);

  if (combos.length === 0) {
    return <Text style={styles.prompt}>{t("settings.shortcuts.capturePrompt")}</Text>;
  }
  return <Keycaps combos={combos} tone="recording" />;
}

interface ShortcutRowProps {
  row: KeyboardShortcutHelpRow;
  bindingId: string | null;
  divider: boolean;
  overrideCombo: string | undefined;
  isCapturing: boolean;
  capturedCombos: string[];
  heldModifiers: string | null;
  canSave: boolean;
  onRebind: () => void;
  onDone: () => void;
  onCancel: () => void;
  onReset: () => void;
}

// Renders one shortcut row across its three live states — default / capturing / override —
// on the codePilot row geometry. Capturing tints the row + keycaps and swaps Rebind for
// Done (model-gated by `canSave`) / Cancel; an override row carries the blue dot + Reset.
function ShortcutRow({
  row,
  bindingId,
  divider,
  overrideCombo,
  isCapturing,
  capturedCombos,
  heldModifiers,
  canSave,
  onRebind,
  onDone,
  onCancel,
  onReset,
}: ShortcutRowProps) {
  const { t } = useTranslation();
  const displayChord = useMemo(
    () => (overrideCombo ? chordStringToShortcutKeys(overrideCombo) : [row.keys]),
    [overrideCombo, row.keys],
  );
  const rowStyle = useMemo(
    () => [
      settingsKit.row,
      divider ? settingsKit.rowDivider : null,
      isCapturing ? styles.rowCapturing : null,
    ],
    [divider, isCapturing],
  );

  const isOverride = overrideCombo !== undefined;
  const showRebind = bindingId !== null && !isCapturing;
  const showDone = bindingId !== null && isCapturing && canSave;
  const showCancel = bindingId !== null && isCapturing;
  const showReset = isOverride && !isCapturing;

  return (
    <View style={rowStyle}>
      <View style={settingsKit.rowLeft}>
        <View style={settingsKit.rowLabel}>
          {isOverride && !isCapturing ? <View style={styles.overrideDot} /> : null}
          <Text style={settingsKit.rowLabelText}>{t(row.labelKey)}</Text>
        </View>
      </View>
      <View style={settingsKit.rowControl}>
        {isCapturing ? (
          <CaptureDisplay capturedCombos={capturedCombos} heldModifiers={heldModifiers} />
        ) : (
          <Keycaps combos={displayChord} tone="default" />
        )}
        {showDone ? (
          <SettingsButton
            label={t("settings.shortcuts.actions.done")}
            variant="primary"
            small
            onPress={onDone}
          />
        ) : null}
        {showCancel ? (
          <SettingsButton
            label={t("settings.shortcuts.actions.cancel")}
            variant="outline"
            small
            onPress={onCancel}
          />
        ) : null}
        {showRebind ? (
          <SettingsButton
            label={t("settings.shortcuts.actions.rebind")}
            icon={Pencil}
            variant="ghost"
            small
            onPress={onRebind}
          />
        ) : null}
        {showReset ? (
          <SettingsButton
            label={t("settings.shortcuts.actions.reset")}
            icon={RotateCcw}
            variant="ghost"
            small
            onPress={onReset}
          />
        ) : null}
      </View>
    </View>
  );
}

interface ShortcutRowContainerProps {
  row: KeyboardShortcutHelpRow;
  bindingId: string | null;
  divider: boolean;
  overrideCombo: string | undefined;
  isCapturing: boolean;
  capturedCombos: string[];
  heldModifiers: string | null;
  canSave: boolean;
  onStartCapture: (bindingId: string) => void;
  onSaveCapture: () => void;
  onCancelCapture: () => void;
  onRemoveOverride: (bindingId: string) => void;
}

// Binds the row's rebind/reset handlers to its bindingId so each row owns stable
// callbacks; pure passthrough otherwise.
function ShortcutRowContainer({
  row,
  bindingId,
  divider,
  overrideCombo,
  isCapturing,
  capturedCombos,
  heldModifiers,
  canSave,
  onStartCapture,
  onSaveCapture,
  onCancelCapture,
  onRemoveOverride,
}: ShortcutRowContainerProps) {
  const handleRebind = useCallback(() => {
    if (bindingId) onStartCapture(bindingId);
  }, [bindingId, onStartCapture]);
  const handleReset = useCallback(() => {
    if (bindingId) onRemoveOverride(bindingId);
  }, [bindingId, onRemoveOverride]);

  return (
    <ShortcutRow
      row={row}
      bindingId={bindingId}
      divider={divider}
      overrideCombo={overrideCombo}
      isCapturing={isCapturing}
      capturedCombos={capturedCombos}
      heldModifiers={heldModifiers}
      canSave={canSave}
      onRebind={handleRebind}
      onDone={onSaveCapture}
      onCancel={onCancelCapture}
      onReset={handleReset}
    />
  );
}

interface ShortcutGroupProps {
  section: KeyboardShortcutHelpSection;
  isFirst: boolean;
  hasOverrides: boolean;
  capture: CaptureState;
  overrides: Record<string, string>;
  isMac: boolean;
  isDesktop: boolean;
  onStartCapture: (bindingId: string) => void;
  onSaveCapture: () => void;
  onCancelCapture: () => void;
  onRemoveOverride: (bindingId: string) => void;
  onResetAll: () => void;
}

// One titled group of shortcut rows inside a codePilot card; the first group carries the
// "reset all" header action whenever any override exists.
function ShortcutGroup({
  section,
  isFirst,
  hasOverrides,
  capture,
  overrides,
  isMac,
  isDesktop,
  onStartCapture,
  onSaveCapture,
  onCancelCapture,
  onRemoveOverride,
  onResetAll,
}: ShortcutGroupProps) {
  const { t } = useTranslation();
  const title = `${t(section.titleKey)} · ${section.rows.length}`;
  const showResetAll = isFirst && hasOverrides;
  const action = useMemo(
    () =>
      showResetAll ? (
        <SettingsButton
          label={t("settings.shortcuts.actions.resetAll")}
          icon={RotateCcw}
          variant="ghost"
          small
          onPress={onResetAll}
        />
      ) : undefined,
    [showResetAll, onResetAll, t],
  );

  return (
    <SettingsGroup title={title} action={action}>
      <SettingsCard>
        {section.rows.map((row, index) => {
          const bindingId = getBindingIdForAction(row.id, { isMac, isDesktop });
          const overrideCombo = bindingId ? overrides[bindingId] : undefined;
          const isRowCapturing = bindingId !== null && capture.bindingId === bindingId;
          return (
            <ShortcutRowContainer
              key={row.id}
              row={row}
              bindingId={bindingId}
              divider={index > 0}
              overrideCombo={overrideCombo}
              isCapturing={isRowCapturing}
              capturedCombos={isRowCapturing ? capture.capturedCombos : EMPTY_CAPTURED_COMBOS}
              heldModifiers={isRowCapturing ? capture.heldModifiers : null}
              canSave={isRowCapturing && canSaveCapture(capture)}
              onStartCapture={onStartCapture}
              onSaveCapture={onSaveCapture}
              onCancelCapture={onCancelCapture}
              onRemoveOverride={onRemoveOverride}
            />
          );
        })}
      </SettingsCard>
    </SettingsGroup>
  );
}

const SHORTCUTS_SUBTITLE =
  "桌面专属 · 41 个动作分 5 组。每行可改键（捕获按键组合）或重置；首组段头可一键全部重置。移动端不可用。";

// The Shortcuts settings section. All capture state lives in the pure `captureReducer`;
// this component only dispatches machine events, syncs the global capture flag, and renders
// model-derived state. Native shows an unavailable note (no hardware keyboard).
export function ShortcutsSection() {
  const { t } = useTranslation();
  const [capture, dispatch] = useReducer(captureReducer, IDLE_CAPTURE_STATE);
  const { overrides, hasOverrides, setOverride, removeOverride, resetAll } =
    useKeyboardShortcutOverrides();
  const setCapturingShortcut = useKeyboardShortcutsStore((s) => s.setCapturingShortcut);

  const isFocused = useIsFocused();
  const isMac = getShortcutOs() === "mac";
  const isDesktop = getIsElectronRuntime();
  const sections = useMemo(
    () => buildKeyboardShortcutHelpSections({ isMac, isDesktop }),
    [isMac, isDesktop],
  );

  const isCapturing = capture.bindingId !== null;

  const startCapture = useCallback((bindingId: string) => {
    dispatch({ type: "start", bindingId });
  }, []);
  const cancelCapture = useCallback(() => {
    dispatch({ type: "cancel" });
  }, []);
  const saveCapture = useCallback(() => {
    if (capture.bindingId === null || !canSaveCapture(capture)) {
      return;
    }
    void setOverride(capture.bindingId, capturedComboString(capture));
    dispatch({ type: "save" });
  }, [capture, setOverride]);
  const handleResetAll = useCallback(() => void resetAll(), [resetAll]);
  const handleRemoveOverride = useCallback(
    (bindingId: string) => void removeOverride(bindingId),
    [removeOverride],
  );

  // Keep the global "suppress shortcuts while capturing" flag in lockstep with the
  // machine, covering blur auto-cancel and unmount (cleanup clears it).
  useEffect(() => {
    setCapturingShortcut(isCapturing);
    return () => setCapturingShortcut(false);
  }, [isCapturing, setCapturingShortcut]);

  // Switching away from the settings tab abandons an in-progress capture.
  useEffect(() => {
    if (!isFocused && isCapturing) {
      dispatch({ type: "blur" });
    }
  }, [isFocused, isCapturing]);

  // Web-only: intercept keydowns while capturing and translate them into machine events.
  // The reducer owns every transition; this only parses DOM events (guarded by isWeb).
  useEffect(() => {
    if (!isWeb) return;
    if (!isCapturing) return;

    function handleKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      if ((event.key ?? "") === "Backspace") {
        dispatch({ type: "backspace" });
        return;
      }

      const comboString = keyboardEventToComboString(event);
      if (comboString === null) {
        dispatch({ type: "key", combo: null, held: heldModifiersFromEvent(event) });
        return;
      }

      dispatch({ type: "key", combo: comboString, held: null });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isCapturing]);

  if (!isWeb) {
    return (
      <SettingsDetail title={t("settings.sections.shortcuts")} subtitle={SHORTCUTS_SUBTITLE}>
        <SettingsAlert icon={Smartphone} title={t("settings.shortcuts.unavailableOnMobile")} />
      </SettingsDetail>
    );
  }

  return (
    <SettingsDetail title={t("settings.sections.shortcuts")} subtitle={SHORTCUTS_SUBTITLE}>
      {sections.map((section, index) => (
        <ShortcutGroup
          key={section.id}
          section={section}
          isFirst={index === 0}
          hasOverrides={hasOverrides}
          capture={capture}
          overrides={overrides}
          isMac={isMac}
          isDesktop={isDesktop}
          onStartCapture={startCapture}
          onSaveCapture={saveCapture}
          onCancelCapture={cancelCapture}
          onRemoveOverride={handleRemoveOverride}
          onResetAll={handleResetAll}
        />
      ))}
    </SettingsDetail>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Capturing row: a subtle elevated tint behind the active row (the accent border lives
  // on the recording keycaps so row geometry never shifts).
  rowCapturing: {
    backgroundColor: theme.colors.surface2,
  },
  keycaps: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.spacing[1],
  },
  cap: {
    minWidth: 22,
    height: 22,
    lineHeight: 22,
    paddingHorizontal: theme.spacing[1.5],
    textAlign: "center",
    fontFamily: theme.fontFamily.mono,
    fontSize: 12,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
  },
  capRecording: {
    color: theme.colors.accent,
    backgroundColor: theme.colors.surface0,
    borderColor: theme.colors.accent,
  },
  prompt: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  overrideDot: {
    width: 7,
    height: 7,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
}));

// Hoisted keycap style refs so JSX never builds a fresh style array per cap.
const RESTING_CAP = styles.cap;
const RECORDING_CAP = [styles.cap, styles.capRecording];
