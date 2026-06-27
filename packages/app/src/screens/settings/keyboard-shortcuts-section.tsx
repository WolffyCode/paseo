import { useCallback, useEffect, useMemo, useReducer } from "react";
import { useTranslation } from "react-i18next";
import { View, Text } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { StyleSheet } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/screens/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Shortcut } from "@/components/ui/shortcut";
import { useKeyboardShortcutOverrides } from "@/hooks/use-keyboard-shortcut-overrides";
import {
  buildKeyboardShortcutHelpSections,
  getBindingIdForAction,
  type KeyboardShortcutHelpRow,
} from "@/keyboard/keyboard-shortcuts";
import {
  canSaveCapture,
  capturedComboString,
  captureReducer,
  IDLE_CAPTURE_STATE,
} from "@/keyboard/shortcut-capture-machine";
import {
  chordStringToShortcutKeys,
  comboStringToShortcutKeys,
  heldModifiersFromEvent,
  keyboardEventToComboString,
} from "@/keyboard/shortcut-string";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { getShortcutOs } from "@/utils/shortcut-platform";
import { getIsElectronRuntime } from "@/constants/layout";
import { isNative } from "@/constants/platform";

const EMPTY_CAPTURED_COMBOS: string[] = [];

function ShortcutSequence({
  chord,
  heldModifiers,
}: {
  chord: string[] | null;
  heldModifiers: string | null;
}) {
  const { t } = useTranslation();
  const displayChord = useMemo(() => {
    const combos = [...(chord ?? [])];
    if (heldModifiers) {
      combos.push(heldModifiers);
    }
    return combos.map(comboStringToShortcutKeys);
  }, [chord, heldModifiers]);

  if ((!chord || chord.length === 0) && !heldModifiers) {
    return <Text style={styles.capturingText}>{t("settings.shortcuts.capturePrompt")}</Text>;
  }

  return <Shortcut chord={displayChord} />;
}

interface ShortcutRowContainerProps {
  row: KeyboardShortcutHelpRow;
  bindingId: string | null;
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

// Binds the row's rebind/reset handlers to its bindingId; pure passthrough otherwise.
function ShortcutRowContainer({
  row,
  bindingId,
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

// Renders one shortcut row across all states (default / capturing / overridden);
// the "done" button is gated by the model-derived `canSave`, not a local count.
function ShortcutRow({
  row,
  bindingId,
  overrideCombo,
  isCapturing,
  capturedCombos,
  heldModifiers,
  canSave,
  onRebind,
  onDone,
  onCancel,
  onReset,
}: {
  row: KeyboardShortcutHelpRow;
  bindingId: string | null;
  overrideCombo: string | undefined;
  isCapturing: boolean;
  capturedCombos: string[];
  heldModifiers: string | null;
  canSave: boolean;
  onRebind: () => void;
  onDone: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const displayChord = useMemo(
    () => (overrideCombo ? chordStringToShortcutKeys(overrideCombo) : [row.keys]),
    [overrideCombo, row.keys],
  );
  const rowStyle = useMemo(() => [styles.row, isCapturing && styles.rowCapturing], [isCapturing]);

  return (
    <View style={rowStyle}>
      <Text style={styles.rowLabel}>{t(row.labelKey)}</Text>
      <View style={styles.rowActions}>
        {isCapturing ? (
          <ShortcutSequence chord={capturedCombos} heldModifiers={heldModifiers} />
        ) : (
          <Shortcut chord={displayChord} />
        )}
        {bindingId !== null && (
          <>
            {isCapturing && canSave ? (
              <Button variant="ghost" size="sm" onPress={onDone}>
                {t("settings.shortcuts.actions.done")}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onPress={isCapturing ? onCancel : onRebind}>
              {isCapturing
                ? t("settings.shortcuts.actions.cancel")
                : t("settings.shortcuts.actions.rebind")}
            </Button>
          </>
        )}
        {overrideCombo !== undefined && !isCapturing && (
          <Button variant="ghost" size="sm" onPress={onReset}>
            <Text style={styles.resetText}>{t("settings.shortcuts.actions.reset")}</Text>
          </Button>
        )}
      </View>
    </View>
  );
}

// Renders the rebindable shortcut list; all capture state lives in the pure
// `captureReducer`, so this component only translates key events into events and
// renders model-derived state. Native has no hardware keyboard, so it shows a
// placeholder instead.
export function KeyboardShortcutsSection() {
  const { t } = useTranslation();
  const [capture, dispatch] = useReducer(captureReducer, IDLE_CAPTURE_STATE);
  const { overrides, hasOverrides, setOverride, removeOverride, resetAll } =
    useKeyboardShortcutOverrides();
  const setCapturingShortcut = useKeyboardShortcutsStore((s) => s.setCapturingShortcut);

  const isFocused = useIsFocused();
  const isMac = getShortcutOs() === "mac";
  const isDesktopApp = getIsElectronRuntime();
  const sections = buildKeyboardShortcutHelpSections({ isMac, isDesktop: isDesktopApp });

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

  // Keep the global "suppress shortcuts while capturing" flag in lockstep with
  // the machine, covering blur auto-cancel and unmount (cleanup clears it).
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

  // Web-only: intercept keydowns while capturing and translate them into
  // machine events. The reducer owns every transition; this only parses events.
  useEffect(() => {
    if (isNative) return;
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

  const handleResetAll = useCallback(() => void resetAll(), [resetAll]);
  const handleRemoveOverride = useCallback(
    (bindingId: string) => void removeOverride(bindingId),
    [removeOverride],
  );

  if (isNative) {
    return (
      <SettingsSection title={t("settings.sections.shortcuts")}>
        <View style={mobileCardStyle}>
          <Text style={styles.mobileText}>{t("settings.shortcuts.unavailableOnMobile")}</Text>
        </View>
      </SettingsSection>
    );
  }

  const resetAllButton = hasOverrides ? (
    <Button variant="ghost" size="sm" onPress={handleResetAll}>
      {t("settings.shortcuts.actions.resetAll")}
    </Button>
  ) : undefined;

  return (
    <>
      {sections.map(function (section, sectionIndex) {
        return (
          <SettingsSection
            key={section.id}
            title={t(section.titleKey)}
            trailing={sectionIndex === 0 ? resetAllButton : undefined}
          >
            <View style={settingsStyles.card}>
              {section.rows.map(function (row, index) {
                const bindingId = getBindingIdForAction(row.id, {
                  isMac,
                  isDesktop: isDesktopApp,
                });
                const overrideCombo = bindingId ? overrides[bindingId] : undefined;
                const isRowCapturing = bindingId !== null && capture.bindingId === bindingId;

                return (
                  <View key={row.id}>
                    <ShortcutRowContainer
                      row={row}
                      bindingId={bindingId}
                      overrideCombo={overrideCombo}
                      isCapturing={isRowCapturing}
                      capturedCombos={
                        isRowCapturing ? capture.capturedCombos : EMPTY_CAPTURED_COMBOS
                      }
                      heldModifiers={isRowCapturing ? capture.heldModifiers : null}
                      canSave={isRowCapturing && canSaveCapture(capture)}
                      onStartCapture={startCapture}
                      onSaveCapture={saveCapture}
                      onCancelCapture={cancelCapture}
                      onRemoveOverride={handleRemoveOverride}
                    />
                    {index < section.rows.length - 1 && <View style={styles.separator} />}
                  </View>
                );
              })}
            </View>
          </SettingsSection>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  rowCapturing: {
    backgroundColor: theme.colors.surface2,
  },
  rowLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  capturingText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  resetText: {
    color: theme.colors.foregroundMuted,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  mobileCard: {
    padding: theme.spacing[4],
  },
  mobileText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
}));

const mobileCardStyle = [settingsStyles.card, styles.mobileCard];
