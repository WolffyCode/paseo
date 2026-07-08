// Right-panel context wiring — the composition root that connects the right panel to a live server
// (mirroring file-tree-context.wiring.ts). It is the ONLY file in the right-panel tree that reads the old
// session-store + host-runtime to obtain the connected DaemonClient + the workspace root / write
// capability; the models/components stay zero-touch on old feature modules. Future switch point: when
// session-store / host-runtime move into the new shell, change ONLY this file.
//
// The client + root + features are read FRESH per tab-create (a reconnect swaps the client; the root
// follows the file tree's live root), so no stale copy is baked into the workbench.

import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useSessionStore } from "@/stores/session-store";
import {
  type ConnectableEditorHandle,
  createConnectableEditorHandle,
} from "../file-tab/components/editor-handle";
import { FileDocumentModel, type FileTabIo } from "../file-tab/model/file-document-model";
import {
  createRightPanelController,
  type RightPanelController,
} from "../model/right-panel-controller";
import type { OpenTabRequest, TabContent, TabContentFactory } from "../model/tab-content";
import { WorkbenchModel } from "../model/workbench-model";
import { shellModel } from "../../model/shell-model";
import { resolveFileTreeAccess } from "./workspace-panels";

// The current connected client for a server (null when disconnected / unknown server).
function currentClient(serverId: string) {
  return getHostRuntimeStore().getSnapshot(serverId)?.client ?? null;
}

// The file-tab IO port over the live client: read via the existing file-explorer channel, write content
// via the new fs.write capability. Both resolve the client per call so a reconnect is transparent; a
// disconnected read/write throws and the model lands in its error / non-blocking-failure state.
function liveIo(serverId: string): FileTabIo {
  const client = (): NonNullable<ReturnType<typeof currentClient>> => {
    const c = currentClient(serverId);
    if (!c) {
      throw new Error("Host disconnected");
    }
    return c;
  };
  return {
    readFile: (cwd, path) => client().readFile(cwd, path),
    // FsWriteFileInput / FsWriteFileResult are structurally identical to the model's port shapes (§5), so
    // this is a transparent pass-through — no re-mapping.
    writeFile: (input) => client().writeFile(input),
  };
}

// The workspace's project root (the cwd host paths are relative to), read fresh from the session.
function conversationRoot(serverId: string, workspaceId: string): string | null {
  return (
    useSessionStore.getState().getSession(serverId)?.workspaces.get(workspaceId)?.projectRootPath ??
    null
  );
}

// Whether the host can write file content (the capability gate → writeCapable), read fresh.
function canWriteFile(serverId: string): boolean {
  return (
    useSessionStore.getState().getSession(serverId)?.serverInfo?.features?.fsWriteFile === true
  );
}

// What a right panel is: its workbench (tab set), its outward controller, and the resolver from a tab's
// content to its editor handle (so the view can mount the CodeMirror surface onto the model's buffer).
export interface RightPanel {
  workbench: WorkbenchModel;
  controller: RightPanelController;
  resolveEditorHandle: (content: TabContent) => ConnectableEditorHandle;
}

// A never-connected fallback handle for the unreachable case where a tab's content has no registered
// handle (every file tab is built through the factory below, which registers one).
const ORPHAN_HANDLE = createConnectableEditorHandle();

// Build the right panel wired to a live server. One per (serverId, workspaceId); the region memoizes it
// and rebuilds it when the workspace changes (architecture §3.5 lifecycle).
export function createRightPanelForServer(serverId: string, workspaceId: string): RightPanel {
  const io = liveIo(serverId);
  // content → its live editor handle. Weak so a closed tab's model + handle are collectable together.
  const handles = new WeakMap<TabContent, ConnectableEditorHandle>();

  const factory: TabContentFactory = {
    create(request: OpenTabRequest): TabContent {
      // Capture the file tree's current root at open time — the base the model derives its root-relative
      // IO path from (location.path is the absolute identity). Fall back to the conversation root when no
      // tree is mounted, matching the root the store joined the absolute identity under.
      const root =
        resolveFileTreeAccess(serverId, workspaceId)?.rootPath ??
        conversationRoot(serverId, workspaceId) ??
        "";
      const handle = createConnectableEditorHandle();
      const model = new FileDocumentModel(
        { root, location: request.location, writeCapable: canWriteFile(serverId) },
        {
          io,
          editor: handle,
          // Reveal the file in the tree: the model hands the ABSOLUTE host path (its identity axis); forward
          // it straight to the file tree's reveal command (the three-branch decision belongs to file-tree).
          revealFile: (absPath) =>
            resolveFileTreeAccess(serverId, workspaceId)?.revealFile(absPath),
        },
      );
      // The factory triggers the load (before the view connects, seeds are buffered by the handle).
      void model.load();
      handles.set(model, handle);
      return model;
    },
  };

  const workbench = new WorkbenchModel(factory);
  const controller = createRightPanelController({
    workbench,
    openRight: () => shellModel.openRight(),
  });
  return {
    workbench,
    controller,
    resolveEditorHandle: (content) => handles.get(content) ?? ORPHAN_HANDLE,
  };
}
