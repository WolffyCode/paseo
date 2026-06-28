import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ShellRoot } from "@/shell/components/shell-root";
import type { ShellContext } from "@/shell/model/shell-model";
import { startShellPersistence } from "@/shell/model/shell-persistence";

// Start AsyncStorage hydration + the persist reaction for the shell layout when the shell
// route module loads (idempotent; runs only in the app, where AsyncStorage exists).
startShellPersistence();

// The connected-host landing: the new desktop shell. It feeds the model the two facts the
// model can't know — whether the shell is shown (true here; this route is reached only
// after a host connects) and the active workspace key. The key is a stable per-host
// placeholder this skeleton milestone, so the right/file-tree tools are enabled and the
// per-workspace width memory has a home; real workspace identity arrives with the
// conversation-content milestone.
export default function HostHomeRoute() {
  const params = useLocalSearchParams<{ serverId?: string }>();
  const serverId = typeof params.serverId === "string" ? params.serverId : "";
  const ctx = useMemo<ShellContext>(
    () => ({
      showsShell: serverId.length > 0,
      workspaceKey: serverId.length > 0 ? `${serverId}:__home__` : null,
    }),
    [serverId],
  );
  if (!serverId) {
    return null;
  }
  return <ShellRoot ctx={ctx} />;
}
