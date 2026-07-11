import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AddHostMethodModal } from "@/components/add-host-method-modal";
import { AddHostModal } from "@/components/add-host-modal";
import { PairLinkModal } from "@/components/pair-link-modal";
import {
  getHostRuntimeStore,
  isHostRuntimeConnected,
  useHostRuntimeConnectionStatus,
} from "@/runtime/host-runtime";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { buildHostRootRoute } from "@/utils/host-routes";
import { ConversationTreePanel } from "../conversation-tree/components/conversation-tree-panel";
import {
  ConversationTreeLoadingState,
  ConversationTreeOfflineBar,
} from "../conversation-tree/components/tree-states";
import { createConversationTreeStoreForServer } from "../conversation-tree/data/conversation-tree-context.wiring";
import type { ConversationTreeStore } from "../conversation-tree/model/conversation-tree-store";
import { HostSwitcher } from "../host-switcher/components/host-switcher";

type AddHostStep = "methods" | "direct" | "pair" | null;

interface TreeMount {
  readonly serverId: string;
  readonly store: ConversationTreeStore;
}

function openCommandCenter(): void {
  useKeyboardShortcutsStore.getState().setCommandCenterOpen(true);
}

/** Own the active host's tree lifecycle and bind the two shell-level React injection points. */
export function LeftRegion({ serverId }: { serverId: string }) {
  const [treeMount, setTreeMount] = useState<TreeMount | null>(null);
  const [addHostStep, setAddHostStep] = useState<AddHostStep>(null);
  const connectionStatus = useHostRuntimeConnectionStatus(serverId);
  const isOffline = connectionStatus === "offline" || connectionStatus === "error";
  const store = treeMount?.serverId === serverId ? treeMount.store : null;

  useEffect(() => {
    const runtime = getHostRuntimeStore();
    let nextStore: ConversationTreeStore | null = null;
    const mountWhenConnected = (): void => {
      if (nextStore !== null || !isHostRuntimeConnected(runtime.getSnapshot(serverId))) {
        return;
      }
      nextStore = createConversationTreeStoreForServer(serverId, {
        openSearch: openCommandCenter,
      });
      setTreeMount({ serverId, store: nextStore });
    };
    const stopRuntime = runtime.subscribe(serverId, mountWhenConnected);
    mountWhenConnected();
    return () => {
      stopRuntime();
      nextStore?.dispose();
    };
  }, [serverId]);

  const switchHost = useCallback((targetServerId: string) => {
    router.navigate(buildHostRootRoute(targetServerId));
  }, []);
  const reconnect = useCallback((targetServerId: string) => {
    void getHostRuntimeStore().runProbeCycleNow(targetServerId);
  }, []);
  const reconnectActiveHost = useCallback(() => reconnect(serverId), [reconnect, serverId]);
  const openAddHost = useCallback(() => setAddHostStep("methods"), []);
  const closeAddHost = useCallback(() => setAddHostStep(null), []);
  const openDirect = useCallback(() => setAddHostStep("direct"), []);
  const openPair = useCallback(() => setAddHostStep("pair"), []);
  const backToMethods = useCallback(() => setAddHostStep("methods"), []);
  const hostSaved = useCallback(
    ({ serverId: savedServerId }: { serverId: string }) => {
      setAddHostStep(null);
      switchHost(savedServerId);
    },
    [switchHost],
  );

  return (
    <View style={styles.region} testID="left-region">
      {isOffline ? <ConversationTreeOfflineBar onReconnect={reconnectActiveHost} /> : null}
      <HostSwitcher
        activeServerId={serverId}
        onSwitchHost={switchHost}
        onReconnect={reconnect}
        onAddHost={openAddHost}
      />
      {store === null ? (
        <View style={styles.loadingMount} testID="conv-tree-mounting">
          <ConversationTreeLoadingState />
        </View>
      ) : (
        <ConversationTreePanel store={store} isOffline={isOffline} />
      )}

      <AddHostMethodModal
        visible={addHostStep === "methods"}
        onClose={closeAddHost}
        onDirectConnection={openDirect}
        onPasteLink={openPair}
        onScanQr={openPair}
      />
      <AddHostModal
        visible={addHostStep === "direct"}
        onClose={closeAddHost}
        onCancel={backToMethods}
        onSaved={hostSaved}
      />
      <PairLinkModal
        visible={addHostStep === "pair"}
        onClose={closeAddHost}
        onCancel={backToMethods}
        onSaved={hostSaved}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  region: { flex: 1, minWidth: 0, minHeight: 0, position: "relative" },
  loadingMount: { flex: 1, minHeight: 0 },
});
