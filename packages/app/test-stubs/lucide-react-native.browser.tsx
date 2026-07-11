import { createElement, type CSSProperties } from "react";

interface BrowserIconProps {
  readonly color?: string;
  readonly size?: number;
}

function browserIcon(name: string) {
  return function BrowserIcon({ color, size = 16 }: BrowserIconProps) {
    const style: CSSProperties = {
      display: "inline-block",
      width: size,
      height: size,
      color,
      flex: "0 0 auto",
    };
    return createElement("span", { "aria-hidden": true, "data-lucide": name, style });
  };
}

export const Bot = browserIcon("bot");
export const Check = browserIcon("check");
export const Clock3 = browserIcon("clock-3");
export const ChevronDown = browserIcon("chevron-down");
export const ChevronRight = browserIcon("chevron-right");
export const Folder = browserIcon("folder");
export const GitBranch = browserIcon("git-branch");
export const MoreHorizontal = browserIcon("more-horizontal");
export const PenLine = browserIcon("pen-line");
export const Plus = browserIcon("plus");
