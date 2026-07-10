import { observer } from "mobx-react-lite";
import { AnchoredMenu, DeferredMenuItemRow } from "./anchored-menu";
import { NEW_TAB_ITEMS } from "./launcher-items";

// The new-tab dropdown opened from the tab strip's "+". It keeps the framework affordance while rendering
// the four deferred kinds as commandless disabled "后续" rows; pathless file creation is absent.

export const NewTabMenu = observer(function NewTabMenu({
  anchor,
  onClose,
}: {
  anchor: { x: number; y: number } | null;
  onClose: () => void;
}) {
  return (
    <AnchoredMenu anchor={anchor} onClose={onClose} width={224}>
      {NEW_TAB_ITEMS.map((item) => (
        <DeferredMenuItemRow key={item.kind} label={item.label} icon={item.icon} />
      ))}
    </AnchoredMenu>
  );
});
