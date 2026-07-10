import type { TabKind } from "../model/tab-content";
import { TAB_KIND_POLICY, type TabKindPolicy } from "../model/tab-kind-policy";
import {
  IconConversation,
  IconFile,
  IconGlobe,
  type PanelIcon,
  IconReview,
  IconTerminal,
} from "./icons";

export interface TabCreationItem {
  readonly kind: TabKind;
  readonly icon: PanelIcon;
  readonly label: string;
  readonly policy: TabKindPolicy;
}

// The five presentation definitions in stable display order; policy stays centralized in
// TAB_KIND_POLICY and is attached below before each creation surface filters its own visibility flag.
const TAB_PRESENTATION: ReadonlyArray<Omit<TabCreationItem, "policy">> = [
  { kind: "file", icon: IconFile, label: "文件" },
  { kind: "terminal", icon: IconTerminal, label: "终端" },
  { kind: "browser", icon: IconGlobe, label: "浏览器" },
  { kind: "review", icon: IconReview, label: "代码审核" },
  { kind: "conversation", icon: IconConversation, label: "对话" },
];

const CREATION_ITEMS: ReadonlyArray<TabCreationItem> = TAB_PRESENTATION.map((item) => ({
  kind: item.kind,
  icon: item.icon,
  label: item.label,
  policy: TAB_KIND_POLICY[item.kind],
}));

// The launcher's policy projection: four deferred roadmap rows; file opens only with a concrete path.
export const LAUNCH_ITEMS = CREATION_ITEMS.filter((item) => item.policy.showInLauncher);

// The trailing "+" menu's independent policy projection; currently the same four deferred roadmap rows.
export const NEW_TAB_ITEMS = CREATION_ITEMS.filter((item) => item.policy.showInNewTab);

// The launcher tells users where file opens live now that a pathless file-creation row no longer exists.
export const LAUNCH_HINT = "文件经左侧目录树或对话打开 · 其余类型后续开放";
