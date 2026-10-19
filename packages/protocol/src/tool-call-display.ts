import type { ToolCallTimelineItem } from "./agent-types.js";
import { getPaseoToolLeafName, isPaseoToolName } from "./tool-name-normalization.js";
import { stripCwdPrefix } from "./path-utils.js";

export type ToolCallDisplayInput = Pick<
  ToolCallTimelineItem,
  "name" | "status" | "error" | "metadata" | "detail"
> & {
  cwd?: string;
};

/** The fixed tool kinds whose name is product wording rather than a provider's tool name. */
export type ToolCallDisplayLabel =
  | "shell"
  | "read"
  | "edit"
  | "write"
  | "search"
  | "fetch"
  | "worktreeSetup"
  | "task"
  | "plan"
  | "thinking"
  | "terminal";

const LABEL_DISPLAY_NAMES: Record<ToolCallDisplayLabel, string> = {
  shell: "Shell",
  read: "Read",
  edit: "Edit",
  write: "Write",
  search: "Search",
  fetch: "Fetch",
  worktreeSetup: "Worktree setup",
  task: "Task",
  plan: "Plan",
  thinking: "Thinking",
  terminal: "Terminal",
};

export interface ToolCallDisplayModel {
  displayName: string;
  /** Set when `displayName` is a fixed label, so a client can show it in its own language. */
  label?: ToolCallDisplayLabel;
  summary?: string;
  errorText?: string;
}

interface DetailDisplay {
  label?: ToolCallDisplayLabel;
  displayName?: string;
  summary?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function humanizeToolName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return name;
  }
  if (isPaseoToolName(trimmed)) {
    const leaf = getPaseoToolLeafName(trimmed);
    if (leaf) {
      return humanizeToolName(leaf);
    }
  }
  if (/[:./]/.test(trimmed) || trimmed.includes("__")) {
    return trimmed;
  }

  return trimmed
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter((segment) => segment.length > 0)
    .join(" ")
    .toLowerCase()
    .replace(/^./, (character) => character.toUpperCase());
}

function formatErrorText(error: unknown): string | undefined {
  if (error === null || error === undefined) {
    return undefined;
  }
  if (typeof error === "string") {
    return error;
  }
  if (isRecord(error) && typeof error.content === "string") {
    return error.content;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function buildFilePathDisplay(
  label: ToolCallDisplayLabel,
  filePath: string,
  cwd: string | undefined,
): DetailDisplay {
  return {
    label,
    summary: stripCwdPrefix(filePath, cwd),
  };
}

function buildCanonicalDetailDisplay(input: ToolCallDisplayInput): DetailDisplay {
  switch (input.detail.type) {
    case "shell":
      return {
        label: "shell",
        summary: input.detail.command,
      };
    case "read":
      return buildFilePathDisplay("read", input.detail.filePath, input.cwd);
    case "edit":
      return buildFilePathDisplay("edit", input.detail.filePath, input.cwd);
    case "write":
      return buildFilePathDisplay("write", input.detail.filePath, input.cwd);
    case "search":
      return {
        label: "search",
        summary: input.detail.query,
      };
    case "fetch":
      return {
        label: "fetch",
        summary: input.detail.url,
      };
    case "worktree_setup":
      return {
        label: "worktreeSetup",
        summary: input.detail.branchName,
      };
    case "sub_agent": {
      const summary = readString(input.detail.description);
      const subAgentType = readString(input.detail.subAgentType);
      if (subAgentType) {
        return { displayName: subAgentType, summary };
      }
      return { label: "task", summary };
    }
    case "plain_text":
      return {
        summary: input.detail.label,
      };
    case "plan":
      return {
        label: "plan",
      };
    case "unknown":
      return {};
    default:
      throw new Error("unreachable");
  }
}

function buildUnknownDetailOverride(input: ToolCallDisplayInput): DetailDisplay {
  const lowerName = input.name.trim().toLowerCase();
  if (input.detail.type === "unknown" && lowerName === "task") {
    return {
      label: "task",
      summary: isRecord(input.metadata) ? readString(input.metadata.subAgentActivity) : undefined,
    };
  }
  if (input.detail.type === "unknown" && lowerName === "thinking") {
    return {
      label: "thinking",
    };
  }
  if (lowerName === "terminal") {
    return {
      label: "terminal",
      summary: input.detail.type === "plain_text" ? readString(input.detail.label) : undefined,
    };
  }
  return {};
}

function resolveName(
  input: ToolCallDisplayInput,
  override: DetailDisplay,
  canonical: DetailDisplay,
): Pick<ToolCallDisplayModel, "displayName" | "label"> {
  const overrideNamesTool = override.label !== undefined || override.displayName !== undefined;
  const named = overrideNamesTool ? override : canonical;
  if (named.label) {
    return { displayName: LABEL_DISPLAY_NAMES[named.label], label: named.label };
  }
  return { displayName: named.displayName ?? humanizeToolName(input.name) };
}

export function buildToolCallDisplayModel(input: ToolCallDisplayInput): ToolCallDisplayModel {
  const canonicalDisplay = buildCanonicalDetailDisplay(input);
  const unknownDetailOverride = buildUnknownDetailOverride(input);
  const name = resolveName(input, unknownDetailOverride, canonicalDisplay);
  const summary = unknownDetailOverride.summary ?? canonicalDisplay.summary;
  const errorText = input.status === "failed" ? formatErrorText(input.error) : undefined;

  return {
    ...name,
    ...(summary ? { summary } : {}),
    ...(errorText ? { errorText } : {}),
  };
}
