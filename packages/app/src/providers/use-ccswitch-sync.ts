import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useSupportsThreeLayerVendors } from "@/providers/use-three-layer-vendors";
import type { CcSwitchSyncItem as ProtocolCcSwitchSyncItem } from "@getpaseo/protocol/messages";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CcSwitchSyncItem = ProtocolCcSwitchSyncItem;

type SyncState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready" };

export interface UseCcSwitchSyncResult {
  state: SyncState;
  selectedCli: "claude" | "codex";
  setSelectedCli: (c: "claude" | "codex") => void;
  itemsByCli: Record<"claude" | "codex", CcSwitchSyncItem[]>;
  countByCli: Record<"claude" | "codex", number>;
  selectedIds: Set<string>;
  toggle: (id: string) => void;
  selectAll: (cli: "claude" | "codex", on: boolean) => void;
  summary: { selected: number; total: number; newCount: number; updateCount: number };
  apply: () => Promise<{ ok: boolean; error?: string }>;
  isApplying: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCcSwitchSync(serverId: string, open: boolean): UseCcSwitchSyncResult {
  const client = useHostRuntimeClient(serverId);
  // COMPAT(threeLayerVendors): added in v0.1.98, drop the gate when floor >= v0.1.98
  const supportsVendors = useSupportsThreeLayerVendors(serverId);
  // Keep a stable ref to client so it doesn't trigger the fetch effect
  const clientRef = useRef(client);
  clientRef.current = client;

  const [state, setState] = useState<SyncState>({ kind: "loading" });
  const [selectedCli, setSelectedCli] = useState<"claude" | "codex">("claude");
  const [itemsByCli, setItemsByCli] = useState<Record<"claude" | "codex", CcSwitchSyncItem[]>>({
    claude: [],
    codex: [],
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);

  // Track the last open value to detect re-opens (false → true)
  const prevOpenRef = useRef<boolean>(false);

  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (!open) return;
    // Only fetch on rising edge (false → true) or on mount when open=true
    if (open === wasOpen && wasOpen) return;

    setState({ kind: "loading" });
    setSelectedIds(new Set());

    let cancelled = false;

    async function fetch() {
      try {
        const c = clientRef.current;
        if (!c) {
          setState({ kind: "error", message: "Client unavailable" });
          return;
        }
        if (!supportsVendors) {
          setState({
            kind: "error",
            message: "Host does not support vendor sync. Update the host to use this feature.",
          });
          return;
        }
        const [claudeResult, codexResult] = await Promise.all([
          c.syncCcSwitch({ cli: "claude", apply: false }),
          c.syncCcSwitch({ cli: "codex", apply: false }),
        ]);

        if (cancelled) return;

        // Check for error in response
        if (claudeResult.error || codexResult.error) {
          const msg = claudeResult.error ?? codexResult.error ?? "Unknown error";
          setState({ kind: "error", message: msg });
          return;
        }

        const claudeItems = claudeResult.items as CcSwitchSyncItem[];
        const codexItems = codexResult.items as CcSwitchSyncItem[];

        setItemsByCli({ claude: claudeItems, codex: codexItems });

        // Default selection: new + update items checked, same unchecked
        const initialSelected = new Set<string>();
        for (const item of [...claudeItems, ...codexItems]) {
          if (item.status === "new" || item.status === "update") {
            initialSelected.add(item.ccSwitchId);
          }
        }
        setSelectedIds(initialSelected);
        setState({ kind: "ready" });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Unknown error";
        setState({ kind: "error", message: msg });
      }
    }

    void fetch();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(
    (cli: "claude" | "codex", on: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const items = itemsByCli[cli];
        for (const item of items) {
          if (on) {
            next.add(item.ccSwitchId);
          } else {
            next.delete(item.ccSwitchId);
          }
        }
        return next;
      });
    },
    [itemsByCli],
  );

  const countByCli = useMemo<Record<"claude" | "codex", number>>(
    () => ({
      claude: itemsByCli.claude.length,
      codex: itemsByCli.codex.length,
    }),
    [itemsByCli],
  );

  const summary = useMemo(() => {
    const items = itemsByCli[selectedCli];
    let selected = 0;
    let newCount = 0;
    let updateCount = 0;
    for (const item of items) {
      if (selectedIds.has(item.ccSwitchId)) selected++;
      if (item.status === "new") newCount++;
      if (item.status === "update") updateCount++;
    }
    return { selected, total: items.length, newCount, updateCount };
  }, [itemsByCli, selectedCli, selectedIds]);

  const apply = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const c = clientRef.current;
    if (!c) return { ok: false, error: "Client unavailable" };
    if (!supportsVendors)
      return {
        ok: false,
        error: "Host does not support vendor sync. Update the host to use this feature.",
      };

    setIsApplying(true);
    try {
      const clis: Array<"claude" | "codex"> = ["claude", "codex"];
      const promises: Array<Promise<void>> = [];

      for (const cli of clis) {
        const items = itemsByCli[cli];
        const selectedForCli = items.map((it) => it.ccSwitchId).filter((id) => selectedIds.has(id));

        if (selectedForCli.length === 0) continue;

        promises.push(
          c.syncCcSwitch({ cli, apply: true, selectedIds: selectedForCli }).then((res) => {
            if (res.error) {
              throw new Error(res.error);
            }
            return undefined;
          }),
        );
      }

      await Promise.all(promises);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Apply failed";
      return { ok: false, error: msg };
    } finally {
      setIsApplying(false);
    }
  }, [itemsByCli, selectedIds, supportsVendors]);

  return {
    state,
    selectedCli,
    setSelectedCli,
    itemsByCli,
    countByCli,
    selectedIds,
    toggle,
    selectAll,
    summary,
    apply,
    isApplying,
  };
}
