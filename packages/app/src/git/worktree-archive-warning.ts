import { confirmDialog } from "@/utils/confirm-dialog";
import { i18n } from "@/i18n/i18next";

export interface WorktreeArchiveRisk {
  isDirty?: boolean | null;
  aheadOfOrigin?: number | null;
  diffStat?: { additions: number; deletions: number } | null;
}

export interface WorktreeArchiveRiskInput {
  archiveHasUncommittedChanges?: boolean | null;
  archiveUnpushedCommitCount?: number | null;
  diffStat?: WorktreeArchiveRisk["diffStat"];
}

export interface WorktreeArchiveConfirmationInput extends WorktreeArchiveRisk {
  workspaceName: string;
}

// Every label is read when the dialog is built, not at module load, so it follows the language
// the app is in now.
function countLabel(count: number, oneKey: string, otherKey: string): string {
  const key = count === 1 ? oneKey : otherKey;
  return i18n.t(key, { count });
}

export function toWorktreeArchiveRisk(input: WorktreeArchiveRiskInput): WorktreeArchiveRisk {
  return {
    isDirty: input.archiveHasUncommittedChanges,
    aheadOfOrigin: input.archiveUnpushedCommitCount,
    diffStat: input.diffStat,
  };
}

function formatDiffStat(diffStat: WorktreeArchiveRisk["diffStat"]): string | null {
  if (!diffStat) {
    return null;
  }

  const parts: string[] = [];
  if (diffStat.additions > 0) {
    parts.push(
      countLabel(
        diffStat.additions,
        "workspace.git.actions.archiveWarning.addedLine",
        "workspace.git.actions.archiveWarning.addedLines",
      ),
    );
  }
  if (diffStat.deletions > 0) {
    parts.push(
      countLabel(
        diffStat.deletions,
        "workspace.git.actions.archiveWarning.deletedLine",
        "workspace.git.actions.archiveWarning.deletedLines",
      ),
    );
  }

  return parts.length > 0
    ? parts.join(i18n.t("workspace.git.actions.archiveWarning.diffStatSeparator"))
    : null;
}

export function buildWorktreeArchiveRiskReasons(input: WorktreeArchiveRisk): string[] {
  const reasons: string[] = [];
  const diffStat = input.diffStat;
  const hasDiffStatChanges = diffStat ? diffStat.additions > 0 || diffStat.deletions > 0 : false;
  const hasUncommittedChanges =
    input.isDirty === true || (input.isDirty == null && hasDiffStatChanges);

  if (hasUncommittedChanges) {
    const diffStatLabel = formatDiffStat(diffStat);
    reasons.push(
      diffStatLabel
        ? i18n.t("workspace.git.actions.archiveWarning.uncommittedChangesWithDiff", {
            diffStat: diffStatLabel,
          })
        : i18n.t("workspace.git.actions.archiveWarning.uncommittedChanges"),
    );
  }

  if ((input.aheadOfOrigin ?? 0) > 0) {
    const aheadOfOrigin = input.aheadOfOrigin ?? 0;
    reasons.push(
      countLabel(
        aheadOfOrigin,
        "workspace.git.actions.archiveWarning.unpushedCommit",
        "workspace.git.actions.archiveWarning.unpushedCommits",
      ),
    );
  }

  return reasons;
}

export function buildWorktreeArchiveConfirmationMessage(
  input: WorktreeArchiveConfirmationInput,
): string | null {
  const reasons = buildWorktreeArchiveRiskReasons(input);
  if (reasons.length === 0) {
    return null;
  }

  return reasons.join("\n");
}

export async function confirmRiskyWorktreeArchive(
  input: WorktreeArchiveConfirmationInput,
): Promise<boolean> {
  const message = buildWorktreeArchiveConfirmationMessage(input);
  if (!message) {
    return true;
  }

  return await confirmDialog({
    title: i18n.t("workspace.git.actions.archiveWarning.title", {
      workspaceName: input.workspaceName,
    }),
    message,
    confirmLabel: i18n.t("workspace.git.actions.archiveWarning.confirm"),
    cancelLabel: i18n.t("workspace.git.actions.archiveWarning.cancel"),
    destructive: true,
  });
}
