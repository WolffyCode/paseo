/**
 * Pure availability derivation for the project (目录) row menu — no React / no IO, so it is
 * trivially unit-testable (the hook lives next door and imports this). Reveal needs the desktop
 * file-manager bridge AND a real working dir; worktree creation just needs a working dir.
 */
export function deriveProjectActionAvailability(input: {
  workingDir: string | undefined;
  hasDesktopBridge: boolean;
}): { canReveal: boolean; canCreateWorktree: boolean } {
  return {
    canReveal: input.hasDesktopBridge && Boolean(input.workingDir),
    canCreateWorktree: Boolean(input.workingDir),
  };
}
