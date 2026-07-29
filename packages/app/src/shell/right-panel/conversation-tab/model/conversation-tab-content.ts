import type { FileLocation } from "../../model/file-location";
import type {
  ActivityDot,
  ConversationTabRequest,
  ConversationTabTarget,
  TabContent,
} from "../../model/tab-content";

/** Hold one right-side conversation target without coupling the tab framework to React panels. */
export class ConversationTabContent implements TabContent {
  readonly activityDot: ActivityDot = "none";
  readonly target: ConversationTabTarget;
  readonly workspaceId: string;
  readonly title: string;
  readonly readOnly: boolean;

  /** Capture the immutable target snapshot used for this tab identity. */
  constructor(request: ConversationTabRequest) {
    this.target = request.target;
    this.workspaceId = request.workspaceId;
    this.title = request.title;
    this.readOnly = request.readOnly;
  }

  /** Ignore file-only cursor retargeting because conversations have no line location. */
  retarget(_location: FileLocation): void {}

  /** Keep activation lifecycle explicit even though conversation loading is owned by the panel. */
  onActivated(): void {}

  /** Keep closing lifecycle explicit because conversation drafts persist through their existing store. */
  onClosing(): void {}
}
