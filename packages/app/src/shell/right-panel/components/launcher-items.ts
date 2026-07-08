import type { TabKind } from "../model/tab-content";
import {
  IconConversation,
  IconFile,
  IconGlobe,
  type PanelIcon,
  IconReview,
  IconTerminal,
} from "./icons";

// The five tab kinds in launcher / new-tab order, each with its icon + label. The static presentation
// projection shared by the launcher list and the new-tab dropdown (both render the same five, only `file`
// usable — enablement/coming-soon come from TAB_KIND_POLICY, not repeated here). This is the UI half; the
// policy table is the model half.
export const LAUNCH_ITEMS: ReadonlyArray<{ kind: TabKind; icon: PanelIcon; label: string }> = [
  { kind: "file", icon: IconFile, label: "文件" },
  { kind: "terminal", icon: IconTerminal, label: "终端" },
  { kind: "browser", icon: IconGlobe, label: "浏览器" },
  { kind: "review", icon: IconReview, label: "代码审核" },
  { kind: "conversation", icon: IconConversation, label: "对话" },
];
