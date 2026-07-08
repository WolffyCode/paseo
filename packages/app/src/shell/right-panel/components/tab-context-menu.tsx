import { observer } from "mobx-react-lite";
import { useCallback } from "react";
import type { WorkbenchModel } from "../model/workbench-model";
import { AnchoredMenu, MenuItemRow } from "./anchored-menu";

// The tab right-click menu (ui.html sRS3) — exactly three items: close this tab / close others / close
// all, each dispatched to the WorkbenchModel (which autosaves any dirty tab as it closes it — no confirm
// dialog). Pure view; closing is the shared AnchoredMenu's outside-click/Esc.

export const TabContextMenu = observer(function TabContextMenu({
  workbench,
  targetId,
  anchor,
  onClose,
}: {
  workbench: WorkbenchModel;
  targetId: string;
  anchor: { x: number; y: number } | null;
  onClose: () => void;
}) {
  const onCloseTab = useCallback(() => {
    workbench.closeTab(targetId);
    onClose();
  }, [workbench, targetId, onClose]);
  const onCloseOthers = useCallback(() => {
    workbench.closeOthers(targetId);
    onClose();
  }, [workbench, targetId, onClose]);
  const onCloseAll = useCallback(() => {
    workbench.closeAll();
    onClose();
  }, [workbench, onClose]);
  return (
    <AnchoredMenu anchor={anchor} onClose={onClose} width={190}>
      <MenuItemRow label="关闭页签" onPress={onCloseTab} />
      <MenuItemRow label="关闭其它页签" onPress={onCloseOthers} />
      <MenuItemRow label="关闭全部页签" onPress={onCloseAll} />
    </AnchoredMenu>
  );
});
