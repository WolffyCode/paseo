import type { TFunction } from "i18next";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { i18n } from "@/i18n/i18next";

export interface BulkClosableTabGroups {
  archiveAgentTabs: Array<{ tabId: string; agentId: string }>;
  layoutOnlyAgentTabs: Array<{ tabId: string; agentId: string }>;
  terminalTabs: Array<{ tabId: string; terminalId: string }>;
  otherTabs: Array<{ tabId: string; target: WorkspaceTabDescriptor["target"] }>;
}

interface CloseWorkspaceTabWithCleanupInput {
  tabId: string;
  target?: WorkspaceTabDescriptor["target"];
}

interface CloseBulkWorkspaceTabsInput {
  client: Pick<DaemonClient, "closeItems"> | null;
  groups: BulkClosableTabGroups;
  closeTab: (tabId: string, action: () => Promise<void>) => Promise<void>;
  closeWorkspaceTabWithCleanup: (input: CloseWorkspaceTabWithCleanupInput) => void;
  closeLayoutOnlyAgent: (agentId: string) => Promise<void>;
  logLabel: string;
  warn?: (message: string, payload: object) => void;
}

export function classifyBulkClosableTabs(
  tabs: WorkspaceTabDescriptor[],
  resolveAgentCloseKind: (agentId: string) => "archive" | "layout-only" = () => "archive",
): BulkClosableTabGroups {
  const groups: BulkClosableTabGroups = {
    archiveAgentTabs: [],
    layoutOnlyAgentTabs: [],
    terminalTabs: [],
    otherTabs: [],
  };

  for (const tab of tabs) {
    if (tab.target.kind === "agent") {
      const agentTab = { tabId: tab.tabId, agentId: tab.target.agentId };
      if (resolveAgentCloseKind(tab.target.agentId) === "layout-only") {
        groups.layoutOnlyAgentTabs.push(agentTab);
      } else {
        groups.archiveAgentTabs.push(agentTab);
      }
      continue;
    }
    if (tab.target.kind === "terminal") {
      groups.terminalTabs.push({ tabId: tab.tabId, terminalId: tab.target.terminalId });
      continue;
    }
    groups.otherTabs.push({ tabId: tab.tabId, target: tab.target });
  }

  return groups;
}

export function buildBulkCloseConfirmationMessage(
  input: BulkClosableTabGroups,
  t: TFunction,
): string {
  const { archiveAgentTabs, layoutOnlyAgentTabs, terminalTabs, otherTabs } = input;
  const tabCount = layoutOnlyAgentTabs.length + otherTabs.length;
  if (archiveAgentTabs.length > 0 && terminalTabs.length > 0 && tabCount > 0) {
    return t("workspace.tabs.confirmations.bulk.all", {
      agents: archiveAgentTabs.length,
      terminals: terminalTabs.length,
      tabs: tabCount,
    });
  }
  if (archiveAgentTabs.length > 0 && terminalTabs.length > 0) {
    return t("workspace.tabs.confirmations.bulk.agentsAndTerminals", {
      agents: archiveAgentTabs.length,
      terminals: terminalTabs.length,
    });
  }
  if (terminalTabs.length > 0 && tabCount > 0) {
    return t("workspace.tabs.confirmations.bulk.terminalsAndTabs", {
      terminals: terminalTabs.length,
      tabs: tabCount,
    });
  }
  if (archiveAgentTabs.length > 0 && tabCount > 0) {
    return t("workspace.tabs.confirmations.bulk.agentsAndTabs", {
      agents: archiveAgentTabs.length,
      tabs: tabCount,
    });
  }
  if (terminalTabs.length > 0) {
    return t("workspace.tabs.confirmations.bulk.terminals", { terminals: terminalTabs.length });
  }
  if (tabCount > 0) {
    return t("workspace.tabs.confirmations.bulk.tabs", { tabs: tabCount });
  }
  return t("workspace.tabs.confirmations.bulk.agents", { agents: archiveAgentTabs.length });
}

export async function closeBulkWorkspaceTabs(input: CloseBulkWorkspaceTabsInput): Promise<void> {
  const {
    client,
    groups,
    closeTab,
    closeWorkspaceTabWithCleanup,
    closeLayoutOnlyAgent,
    logLabel,
    warn,
  } = input;
  const hasDestructiveTabs = groups.archiveAgentTabs.length > 0 || groups.terminalTabs.length > 0;

  for (const { tabId, agentId } of groups.layoutOnlyAgentTabs) {
    await closeTab(tabId, async () => {
      try {
        await closeLayoutOnlyAgent(agentId);
      } catch (error) {
        warn?.(`[WorkspaceScreen] Failed to close subagent tab ${logLabel}`, { error, agentId });
        return;
      }
      closeWorkspaceTabWithCleanup({
        tabId,
        target: { kind: "agent", agentId },
      });
    });
  }

  if (hasDestructiveTabs && client) {
    void client
      .closeItems({
        agentIds: groups.archiveAgentTabs.map((tab) => tab.agentId),
        terminalIds: groups.terminalTabs.map((tab) => tab.terminalId),
      })
      .catch((error) => {
        warn?.(`[WorkspaceScreen] Failed to bulk close tabs ${logLabel}`, { error });
      });
  } else if (hasDestructiveTabs) {
    warn?.(`[WorkspaceScreen] Failed to bulk close tabs ${logLabel}`, {
      error: new Error(i18n.t("common.errors.daemonClientUnavailable")),
    });
  }

  await Promise.all([
    ...groups.archiveAgentTabs.map(({ tabId, agentId }) =>
      closeTab(tabId, async () => {
        closeWorkspaceTabWithCleanup({
          tabId,
          target: { kind: "agent", agentId },
        });
      }),
    ),
    ...groups.terminalTabs.map(({ tabId, terminalId }) =>
      closeTab(tabId, async () => {
        closeWorkspaceTabWithCleanup({
          tabId,
          target: { kind: "terminal", terminalId },
        });
      }),
    ),
    ...groups.otherTabs.map(({ tabId, target }) =>
      closeTab(tabId, async () => {
        closeWorkspaceTabWithCleanup({ tabId, target });
      }),
    ),
  ]);
}
