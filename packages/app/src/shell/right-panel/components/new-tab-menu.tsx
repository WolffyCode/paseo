import { observer } from "mobx-react-lite";
import { useCallback } from "react";
import type { RightPanelController } from "../model/right-panel-controller";
import type { TabKind } from "../model/tab-content";
import { TAB_KIND_POLICY } from "../model/tab-kind-policy";
import { AnchoredMenu, MenuItemRow } from "./anchored-menu";
import { LAUNCH_ITEMS } from "./launcher-items";

// The new-tab dropdown (ui.html sRS3) opened from the tab strip's "+". It renders the same five-kind
// projection as the launcher — only `file` usable (⌘P), the other four disabled + "后续" — and dispatches
// openLauncherType on pick. Pure view over TAB_KIND_POLICY + the controller; closing is the shared
// AnchoredMenu's outside-click/Esc.

export const NewTabMenu = observer(function NewTabMenu({
  controller,
  anchor,
  onClose,
}: {
  controller: RightPanelController;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
}) {
  return (
    <AnchoredMenu anchor={anchor} onClose={onClose} width={224}>
      {LAUNCH_ITEMS.map((item) => (
        <NewTabRow
          key={item.kind}
          kind={item.kind}
          icon={item.icon}
          label={item.label}
          controller={controller}
          onClose={onClose}
        />
      ))}
    </AnchoredMenu>
  );
});

// One dropdown row: enabled for `file` (opens a file tab, shows ⌘P), disabled + "后续" otherwise.
const NewTabRow = observer(function NewTabRow({
  kind,
  icon,
  label,
  controller,
  onClose,
}: {
  kind: TabKind;
  icon: (typeof LAUNCH_ITEMS)[number]["icon"];
  label: string;
  controller: RightPanelController;
  onClose: () => void;
}) {
  const policy = TAB_KIND_POLICY[kind];
  const onPress = useCallback(() => {
    controller.openLauncherType(kind);
    onClose();
  }, [controller, kind, onClose]);
  return (
    <MenuItemRow
      label={label}
      icon={icon}
      shortcut={policy.shortcutHint}
      soon={policy.comingSoon}
      disabled={!policy.enabled}
      onPress={onPress}
    />
  );
});
