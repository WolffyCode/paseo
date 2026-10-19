import { useActiveWorkspacePin } from "@/hooks/use-active-workspace-pin";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionId } from "@/keyboard/keyboard-action-dispatcher";

const WORKSPACE_PIN_ACTIONS: readonly KeyboardActionId[] = ["workspace.pin"];

// The pin shortcut used to live on the sidebar row, so it disappeared whenever the row was not
// rendered — a collapsed project or status group, a collapsed Pinned section, or focus mode.
// It belongs here instead: one registration keyed on the active route selection.
export function useGlobalWorkspacePinAction() {
  const pin = useActiveWorkspacePin();

  useKeyboardActionHandler({
    handlerId: "workspace-pin-global",
    actions: WORKSPACE_PIN_ACTIONS,
    enabled: pin.canToggle,
    priority: 0,
    handle: pin.toggle,
  });
}
