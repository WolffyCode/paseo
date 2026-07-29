import { router } from "expo-router";
import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AddHostMethodModal } from "@/components/add-host-method-modal";
import { AddHostModal } from "@/components/add-host-modal";
import { PairLinkModal } from "@/components/pair-link-modal";
import { getHostRuntimeStore, useHostRuntimeConnectionStatus } from "@/runtime/host-runtime";
import { buildHostRootRoute } from "@/utils/host-routes";
import { ConversationTreePanel } from "../conversation-tree/components/conversation-tree-panel";
import {
  ConversationTreeLoadingState,
  ConversationTreeOfflineBar,
} from "../conversation-tree/components/tree-states";
import type { ConversationTreeStore } from "../conversation-tree/model/conversation-tree-store";
import { HostSwitcher } from "../host-switcher/components/host-switcher";
import { ConversationSearchOverlay } from "./conversation-search-overlay";

type AddHostStep = "methods" | "direct" | "pair" | null;

/**
 * Render the active host's tree and host controls. The shell root owns the tree lifecycle so
 * selection remains available to the conversation region while this sidebar is collapsed.
 */
export function LeftRegion({
  serverId,
  store,
  searchOpen,
  onCloseSearch,
}: {
  serverId: string;
  store: ConversationTreeStore | null;
  searchOpen: boolean;
  onCloseSearch: () => void;
}) {
  const [addHostStep, setAddHostStep] = useState<AddHostStep>(null);
  const connectionStatus = useHostRuntimeConnectionStatus(serverId);
  const isOffline = connectionStatus === "offline" || connectionStatus === "error";

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
        <>
          <ConversationTreePanel store={store} isOffline={isOffline} />
          <ConversationSearchOverlay store={store} visible={searchOpen} onClose={onCloseSearch} />
        </>
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
