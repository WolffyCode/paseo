import { observer } from "mobx-react-lite";
import { useCallback } from "react";
import {
  AnchoredMenu,
  DeferredMenuItemRow,
  DisabledMenuItemRow,
  MenuItemRow,
} from "./anchored-menu";
import { NEW_TAB_ITEMS } from "./launcher-items";

// The new-tab dropdown opened from the tab strip's "+". It keeps the framework affordance while rendering
// the four deferred kinds as commandless disabled "后续" rows; pathless file creation is absent.

export const NewTabMenu = observer(function NewTabMenu({
  anchor,
  onClose,
  canCreateConversation,
  onCreateConversation,
}: {
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  canCreateConversation: boolean;
  onCreateConversation: () => void;
}) {
  const createConversation = useCallback(() => {
    onCreateConversation();
    onClose();
  }, [onClose, onCreateConversation]);
  return (
    <AnchoredMenu anchor={anchor} onClose={onClose} width={224}>
      {NEW_TAB_ITEMS.map((item) => {
        if (item.kind !== "conversation" || !item.policy.enabled) {
          return <DeferredMenuItemRow key={item.kind} label={item.label} icon={item.icon} />;
        }
        if (!canCreateConversation) {
          return <DisabledMenuItemRow key={item.kind} label={item.label} />;
        }
        return (
          <MenuItemRow
            key={item.kind}
            label={item.label}
            icon={item.icon}
            onPress={createConversation}
          />
        );
      })}
    </AnchoredMenu>
  );
});
