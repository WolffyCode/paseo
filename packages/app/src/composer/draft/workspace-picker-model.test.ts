import { describe, expect, it } from "vitest";
import {
  draftWorkspaceDirectoryName,
  normalizeFilesystemBrowserPath,
  resolveFilesystemParent,
  shouldUseNativeDirectoryPicker,
} from "./workspace-picker-model";

describe("draftWorkspaceDirectoryName", () => {
  it("uses the last directory segment across host path formats", () => {
    expect(draftWorkspaceDirectoryName("/Volumes/Aether/coding/person/helm")).toBe("helm");
    expect(draftWorkspaceDirectoryName("C:\\work\\helm\\")).toBe("helm");
    expect(draftWorkspaceDirectoryName("~/coding/helm/")).toBe("helm");
  });

  it("keeps a root path recognizable when it has no directory segment", () => {
    expect(draftWorkspaceDirectoryName("/")).toBe("/");
    expect(draftWorkspaceDirectoryName("  ")).toBe("");
  });
});

describe("shouldUseNativeDirectoryPicker", () => {
  it("uses the operating-system directory dialog for a local Electron host", () => {
    expect(shouldUseNativeDirectoryPicker({ isLocalDaemon: true, isElectron: true })).toBe(true);
  });

  it("keeps remote hosts and plain browsers on the host-backed path picker", () => {
    expect(shouldUseNativeDirectoryPicker({ isLocalDaemon: false, isElectron: true })).toBe(false);
    expect(shouldUseNativeDirectoryPicker({ isLocalDaemon: true, isElectron: false })).toBe(false);
  });
});

describe("filesystem browser paths", () => {
  it("normalizes host-relative paths without changing the root marker", () => {
    expect(normalizeFilesystemBrowserPath("./packages\\app//src")).toBe("packages/app/src");
    expect(normalizeFilesystemBrowserPath("  ")).toBe(".");
  });

  it("walks upward until the host home root", () => {
    expect(resolveFilesystemParent(".")).toBeNull();
    expect(resolveFilesystemParent("packages/app")).toBe("packages");
    expect(resolveFilesystemParent("packages")).toBe(".");
  });
});
