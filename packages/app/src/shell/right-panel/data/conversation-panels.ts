export interface ConversationPanelLifecycle {
  readonly workbench: { closeAll(): void };
}

interface ConversationPanelEntry<Panel extends ConversationPanelLifecycle> {
  readonly workspaceId: string;
  readonly panel: Panel;
}

export type ConversationPanelFactory<Panel extends ConversationPanelLifecycle> = (
  serverId: string,
  workspaceId: string,
) => Panel;

/** Keep one right Workbench per center conversation even while its visible region is unmounted. */
export class ConversationPanels<Panel extends ConversationPanelLifecycle> {
  private readonly panels = new Map<string, ConversationPanelEntry<Panel>>();

  /** Bind the collection to one host so view keys can never resolve against another daemon. */
  constructor(
    private readonly serverId: string,
    private readonly factory: ConversationPanelFactory<Panel>,
  ) {}

  /** Resolve one stable panel, replacing only an invalid entry whose workspace ownership changed. */
  resolve(viewKey: string, workspaceId: string): Panel {
    const current = this.panels.get(viewKey);
    if (current?.workspaceId === workspaceId) {
      return current.panel;
    }
    current?.panel.workbench.closeAll();
    const panel = this.factory(this.serverId, workspaceId);
    this.panels.set(viewKey, { workspaceId, panel });
    return panel;
  }

  /** Move a draft's exact Workbench instance onto the created agent identity without copying tabs. */
  retarget(fromViewKey: string, toViewKey: string): void {
    if (fromViewKey === toViewKey) return;
    const source = this.panels.get(fromViewKey);
    if (source === undefined) return;
    const destination = this.panels.get(toViewKey);
    if (destination !== undefined && destination.panel !== source.panel) {
      source.panel.workbench.closeAll();
    } else {
      this.panels.set(toViewKey, source);
    }
    this.panels.delete(fromViewKey);
  }

  /** Release every cached tab content when the owning host Shell unmounts. */
  dispose(): void {
    for (const { panel } of this.panels.values()) {
      panel.workbench.closeAll();
    }
    this.panels.clear();
  }
}
