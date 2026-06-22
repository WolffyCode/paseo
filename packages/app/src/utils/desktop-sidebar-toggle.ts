interface DesktopSidebarToggleInput {
  isAgentListOpen: boolean;
  openAgentList: () => void;
  closeAgentList: () => void;
}

export function toggleDesktopSidebarsWithCheckoutIntent(input: DesktopSidebarToggleInput): boolean {
  if (input.isAgentListOpen) {
    input.closeAgentList();
    return true;
  }

  input.openAgentList();
  return true;
}
