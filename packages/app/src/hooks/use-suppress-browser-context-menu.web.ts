import { useEffect } from "react";

/**
 * Web/Electron: suppress the browser's native context menu (Copy / Paste / Select All) everywhere
 * EXCEPT our own custom menus. The sidebar's ContextMenuTrigger calls stopPropagation() on its
 * contextmenu event, so it never reaches this document-level listener — its custom menu still opens.
 * Everything else (canvas, empty areas) no longer pops the browser menu (反馈: 空白区域右键要删掉;
 * 目前只有左侧侧边栏目录/对话有右键, 其它要右键的会陆续添加)。
 */
export function useSuppressBrowserContextMenu(): void {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      event.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);
}
