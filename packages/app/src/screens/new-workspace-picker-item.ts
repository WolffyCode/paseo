import type { TFunction } from "i18next";
import type { CreatePaseoWorktreeInput } from "@getpaseo/client/internal/daemon-client";
import type { ForgeSearchItem } from "@getpaseo/protocol/messages";
import type { ComboboxOptionModel } from "@/components/ui/combobox-options";
import { getForgePresentation } from "@/git/forge";

export interface BranchPickerDetail {
  name: string;
  committerDate: number;
  hasLocal?: boolean;
  hasRemote?: boolean;
  localAhead?: number;
  localBehind?: number;
}

export type PickerItem =
  | {
      kind: "branch";
      name: string;
      refName: string;
      accessibilityLabel: string;
      divergenceLabel?: string;
      committerDate?: number;
    }
  | {
      kind: "github-pr";
      item: ForgeSearchItem;
    };

export type PickerCheckoutRequest = Pick<
  CreatePaseoWorktreeInput,
  "action" | "refName" | "checkoutSource" | "githubPrNumber"
>;

const BRANCH_OPTION_PREFIX = "branch:";
const PR_OPTION_PREFIX = "github-pr:";
const REMOTE_TRACKING_PREFIX = "refs/remotes/";

export function branchPickerOptionId(refName: string): string {
  return `${BRANCH_OPTION_PREFIX}${refName}`;
}

function divergenceLabel(ahead: number, behind: number): string | undefined {
  const parts = [ahead > 0 ? `+${ahead}` : null, behind > 0 ? `−${behind}` : null].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}

// Separate keys for exactly one commit, because locales only carry one/other plural forms and
// Russian or Arabic would otherwise fall back to English for every other count.
function divergenceAccessibility(
  ahead: number,
  behind: number,
  counterpart: string,
  t: TFunction,
): string {
  if (ahead === 0 && behind === 0) {
    return t("newWorkspace.refPicker.divergence.upToDate", { counterpart });
  }
  if (ahead > 0 && behind > 0) {
    const key =
      ahead === 1
        ? "newWorkspace.refPicker.divergence.aheadAndBehindOne"
        : "newWorkspace.refPicker.divergence.aheadAndBehindMany";
    return t(key, { count: ahead, behind, counterpart });
  }
  if (ahead > 0) {
    const key =
      ahead === 1
        ? "newWorkspace.refPicker.divergence.aheadOne"
        : "newWorkspace.refPicker.divergence.aheadMany";
    return t(key, { count: ahead, counterpart });
  }
  const key =
    behind === 1
      ? "newWorkspace.refPicker.divergence.behindOne"
      : "newWorkspace.refPicker.divergence.behindMany";
  return t(key, { count: behind, counterpart });
}

export function buildBranchPickerItems(
  details: readonly BranchPickerDetail[],
  t: TFunction,
): PickerItem[] {
  const items: PickerItem[] = [];

  for (const detail of details) {
    const hasKnownProvenance = detail.hasLocal !== undefined || detail.hasRemote !== undefined;
    if (!hasKnownProvenance) {
      items.push({
        kind: "branch",
        name: detail.name,
        refName: detail.name,
        accessibilityLabel: t("newWorkspace.refPicker.branchAccessibility.branch", {
          name: detail.name,
        }),
        committerDate: detail.committerDate,
      });
      continue;
    }

    const hasLocal = detail.hasLocal === true;
    const hasRemote = detail.hasRemote === true;
    const localAhead = detail.localAhead;
    const localBehind = detail.localBehind;
    const hasDivergence =
      hasLocal && hasRemote && localAhead !== undefined && localBehind !== undefined;
    const refsDiffer = hasDivergence && (localAhead > 0 || localBehind > 0);
    // One row when the two refs point at the same commit, two rows when they differ or
    // when the divergence is unknown.
    const showsBothRefs = hasLocal && hasRemote && (!hasDivergence || refsDiffer);

    // The origin row goes first because it is the default base, and it never states
    // divergence: it is the reference point the local row is measured against.
    if (hasRemote) {
      items.push({
        kind: "branch",
        name: detail.name,
        refName: `refs/remotes/origin/${detail.name}`,
        accessibilityLabel: t("newWorkspace.refPicker.branchAccessibility.origin", {
          name: detail.name,
        }),
        committerDate: detail.committerDate,
      });
    }

    if (hasLocal && (showsBothRefs || !hasRemote)) {
      const localItem: Extract<PickerItem, { kind: "branch" }> = {
        kind: "branch",
        name: showsBothRefs
          ? t("newWorkspace.refPicker.localRefName", { name: detail.name })
          : detail.name,
        refName: `refs/heads/${detail.name}`,
        accessibilityLabel: t("newWorkspace.refPicker.branchAccessibility.local", {
          name: detail.name,
        }),
        committerDate: detail.committerDate,
      };
      if (hasDivergence) {
        localItem.divergenceLabel = divergenceLabel(localAhead, localBehind);
        localItem.accessibilityLabel = t(
          "newWorkspace.refPicker.branchAccessibility.localWithDivergence",
          {
            name: detail.name,
            divergence: divergenceAccessibility(
              localAhead,
              localBehind,
              `origin ${detail.name}`,
              t,
            ),
          },
        );
      }
      items.push(localItem);
    }
  }

  return items;
}

export interface BaseRefCheckoutStatus {
  currentBranch: string | null;
  upstreamRef?: string | null;
}

// Display only. The exact ref is what every request carries; this is just how a ref reads in
// a row label, so "refs/remotes/origin/other-name" shows as "other-name".
function branchNameFromRef(refName: string): string {
  if (refName.startsWith("refs/heads/")) return refName.slice("refs/heads/".length);
  if (refName.startsWith(REMOTE_TRACKING_PREFIX)) {
    const remainder = refName.slice(REMOTE_TRACKING_PREFIX.length);
    const separator = remainder.indexOf("/");
    return separator === -1 ? remainder : remainder.slice(separator + 1);
  }
  return refName;
}

// Names the row after where its ref lives, for disambiguating two rows that would otherwise
// read the same. Remote names are runtime values, so only the local qualifier is translated.
function qualifiedRefName(name: string, refName: string, t: TFunction): string | null {
  if (refName.startsWith("refs/heads/")) {
    return t("newWorkspace.refPicker.localRefName", { name });
  }
  if (!refName.startsWith(REMOTE_TRACKING_PREFIX)) {
    return null;
  }
  const remainder = refName.slice(REMOTE_TRACKING_PREFIX.length);
  const separator = remainder.indexOf("/");
  if (separator === -1) {
    return null;
  }
  return `${name} (${remainder.slice(0, separator)})`;
}

// The one owner of "what do we branch off when the user picked nothing". The checkmarked
// row, the trigger label, and the created ref all read this; computing it twice is how the
// picker once showed local main while branching off something else.
//
// The upstream wins when the branch has one, because branching off the local ref silently
// carries unpushed commits into the new workspace. The daemon sends the resolved ref rather
// than a remote name, so a fork tracking upstream/main branches from upstream/main.
export function defaultBasePickerItem(
  status: BaseRefCheckoutStatus,
  t: TFunction,
): PickerItem | null {
  const currentBranch = status.currentBranch;
  if (!currentBranch) return null;
  // COMPAT(checkoutUpstreamRef): added in v0.2.6, remove after 2027-02-01 once the daemon
  // floor sends upstreamRef. Daemons that predate it omit the field, which lands on the
  // local ref — the base those daemons always used.
  const refName = status.upstreamRef ?? `refs/heads/${currentBranch}`;
  // The upstream branch can be named differently from the local one, so the row reads the
  // ref rather than the branch the user happens to be on.
  const name = branchNameFromRef(refName);
  const accessibilityKey = status.upstreamRef
    ? "newWorkspace.refPicker.branchAccessibility.upstream"
    : "newWorkspace.refPicker.branchAccessibility.local";
  return {
    kind: "branch",
    name,
    refName,
    accessibilityLabel: t(accessibilityKey, { name }),
  };
}

export function pickerItemToCheckoutRequest(
  item: PickerItem | null,
): PickerCheckoutRequest | undefined {
  if (!item) return undefined;
  switch (item.kind) {
    case "branch":
      return { action: "branch-off", refName: item.refName };
    case "github-pr": {
      const headRefName = item.item.headRefName?.trim();
      const forge = item.item.forge ?? "github";
      return {
        action: "checkout",
        ...(headRefName ? { refName: headRefName } : {}),
        checkoutSource: {
          kind: "change_request",
          forge,
          number: item.item.number,
          ...(item.item.projectPath ? { projectPath: item.item.projectPath } : {}),
        },
        ...(forge === "github"
          ? {
              // COMPAT(githubPrNumber): send the legacy GitHub checkout input
              // to daemons predating checkoutSource. Remove after 2027-01-17
              // once the supported daemon floor is >= v0.2.0.
              githubPrNumber: item.item.number,
            }
          : {}),
      };
    }
  }
}

export function prPickerOptionId(number: number): string {
  return `${PR_OPTION_PREFIX}${number}`;
}

export function pickerOptionId(item: PickerItem): string {
  return item.kind === "branch"
    ? branchPickerOptionId(item.refName)
    : prPickerOptionId(item.item.number);
}

function formatPrLabel(item: Pick<ForgeSearchItem, "forge" | "number" | "title">): string {
  const presentation = getForgePresentation(item.forge ?? "github");
  return `${presentation.numberPrefix}${item.number} ${item.title}`;
}

export function pickerItemLabel(item: PickerItem): string {
  return item.kind === "branch" ? item.name : formatPrLabel(item.item);
}

export interface PickerOptionData {
  options: ComboboxOptionModel[];
  itemById: Map<string, PickerItem>;
  selectedOptionId: string;
}

interface TimedOption {
  option: ComboboxOptionModel;
  timestamp: number;
}

export function buildPickerOptionData(input: {
  branchDetails: readonly BranchPickerDetail[];
  prItems: readonly ForgeSearchItem[];
  baseItem: PickerItem | null;
  t: TFunction;
}): PickerOptionData {
  const itemById = new Map<string, PickerItem>();
  const timedOptions: TimedOption[] = [];

  for (const branch of buildBranchPickerItems(input.branchDetails, input.t)) {
    if (branch.kind !== "branch") continue;
    const id = branchPickerOptionId(branch.refName);
    itemById.set(id, branch);
    timedOptions.push({
      option: { id, label: pickerItemLabel(branch) },
      timestamp: branch.committerDate ?? 0,
    });
  }

  for (const pr of input.prItems) {
    if (!pr.headRefName) continue;
    const id = prPickerOptionId(pr.number);
    itemById.set(id, { kind: "github-pr", item: pr });
    const updatedAtMs = pr.updatedAt ? Date.parse(pr.updatedAt) : 0;
    const timestamp = Number.isNaN(updatedAtMs) ? 0 : Math.floor(updatedAtMs / 1000);
    timedOptions.push({ option: { id, label: formatPrLabel(pr) }, timestamp });
  }

  const baseItem = input.baseItem;
  if (!baseItem) {
    timedOptions.sort((a, b) => b.timestamp - a.timestamp);
    return { options: timedOptions.map((t) => t.option), itemById, selectedOptionId: "" };
  }

  const selectedOptionId = pickerOptionId(baseItem);
  if (!itemById.has(selectedOptionId)) {
    // The label lives on the item, so the row and the trigger read it from the same place.
    const labeledItem = disambiguate(baseItem, timedOptions, input.t);
    itemById.set(selectedOptionId, labeledItem);
    timedOptions.push({
      option: { id: selectedOptionId, label: pickerItemLabel(labeledItem) },
      // The base sorts first: it is what a workspace is created from unless you pick something.
      timestamp: Number.POSITIVE_INFINITY,
    });
  }

  timedOptions.sort((a, b) => b.timestamp - a.timestamp);
  return { options: timedOptions.map((t) => t.option), itemById, selectedOptionId };
}

// Two rows reading "main" would be a coin flip for the user, so the added row says where its
// ref lives. Only when it collides — a lone row needs no qualifier.
function disambiguate(
  item: PickerItem,
  existing: readonly TimedOption[],
  t: TFunction,
): PickerItem {
  if (item.kind !== "branch") return item;
  if (!existing.some((entry) => entry.option.label === item.name)) return item;
  const name = qualifiedRefName(item.name, item.refName, t);
  if (!name) return item;
  return {
    ...item,
    name,
    // Every locale's accessibility template starts with {{name}}, so re-prefixing keeps the
    // spoken label and the visible one the same string.
    accessibilityLabel: `${name}${item.accessibilityLabel.slice(item.name.length)}`,
  };
}
