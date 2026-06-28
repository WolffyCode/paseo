import { describe, expect, it } from "vitest";
import {
  buildHostAgentDetailRoute,
  buildHostHomeRoute,
  buildHostNewWorkspaceRoute,
  buildHostRootRoute,
  buildHostWorkspaceOpenRoute,
  buildHostWorkspaceRoute,
  buildProjectSettingsRoute,
  buildProjectsSettingsRoute,
  decodeFilePathFromPathSegment,
  decodeWorkspaceIdFromPathSegment,
  encodeFilePathForPathSegment,
  encodeWorkspaceIdForPathSegment,
  isHostHomePathname,
  isSettingsPathname,
  normalizeHostSectionSlug,
  parseHostAgentRouteFromPathname,
  parseSettingsRoute,
  parseHostWorkspaceOpenIntentFromPathname,
  parseHostWorkspaceRouteFromPathname,
  parseWorkspaceOpenIntent,
} from "./host-routes";

describe("buildHostHomeRoute", () => {
  // The connected-host landing the index route redirects to; encodes the serverId.
  it("builds /h/<serverId>/home and degrades to / for an empty id", () => {
    expect(buildHostHomeRoute("local")).toBe("/h/local/home");
    expect(buildHostHomeRoute("")).toBe("/");
  });
});

describe("isHostHomePathname", () => {
  // Drives the one layout gate that lets /home render its own shell chrome instead of the
  // legacy home-shell wrapper. Matches exactly the home landing, ignoring query/hash, and
  // rejects sibling/nested routes so only /home bypasses the wrapper.
  it("matches the home landing route, ignoring query and hash", () => {
    expect(isHostHomePathname("/h/local/home")).toBe(true);
    expect(isHostHomePathname("/h/local/home?open=agent:1")).toBe(true);
    expect(isHostHomePathname("/h/local/home#section")).toBe(true);
  });

  it("rejects non-home routes", () => {
    expect(isHostHomePathname("/h/local")).toBe(false);
    expect(isHostHomePathname("/h/local/sessions")).toBe(false);
    expect(isHostHomePathname("/h/local/home/extra")).toBe(false);
    expect(isHostHomePathname("/settings")).toBe(false);
  });
});

describe("parseHostAgentRouteFromPathname", () => {
  it("continues parsing detail routes", () => {
    expect(parseHostAgentRouteFromPathname("/h/local/agent/abc123")).toEqual({
      serverId: "local",
      agentId: "abc123",
    });
  });
});

describe("workspace route parsing", () => {
  it("keeps URL-safe workspace IDs unencoded", () => {
    expect(encodeWorkspaceIdForPathSegment("164")).toBe("164");
    expect(decodeWorkspaceIdFromPathSegment("164")).toBe("164");
    expect(decodeWorkspaceIdFromPathSegment("wks_10b3479c955fcc4c")).toBe("wks_10b3479c955fcc4c");
  });

  it("encodes non-URL-safe workspace IDs as base64url", () => {
    expect(encodeWorkspaceIdForPathSegment("/tmp/repo")).toBe("b64_L3RtcC9yZXBv");
    expect(decodeWorkspaceIdFromPathSegment("L3RtcC9yZXBv")).toBe("/tmp/repo");
  });

  it("decodes non-canonical base64url workspace IDs used by older links", () => {
    expect(decodeWorkspaceIdFromPathSegment("L1VzZXJzL21vYm91ZHJhL2Rldi9wYXNlby")).toBe(
      "/Users/moboudra/dev/paseo",
    );
  });

  it("encodes file paths as base64url (no padding)", () => {
    const encoded = encodeFilePathForPathSegment("src/index.ts");
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeFilePathFromPathSegment(encoded)).toBe("src/index.ts");
  });

  it("parses workspace route with a plain workspace id", () => {
    expect(parseHostWorkspaceRouteFromPathname("/h/local/workspace/164")).toEqual({
      serverId: "local",
      workspaceId: "164",
    });
  });

  it("parses workspace route with legacy base64 path", () => {
    expect(parseHostWorkspaceRouteFromPathname("/h/local/workspace/L3RtcC9yZXBv")).toEqual({
      serverId: "local",
      workspaceId: "/tmp/repo",
    });
  });

  it("does not treat /tab routes as valid workspace routes", () => {
    expect(
      parseHostWorkspaceRouteFromPathname("/h/local/workspace/L3RtcC9yZXBv/tab/draft_abc123"),
    ).toBeNull();
  });

  it("builds plain workspace routes for URL-safe ids", () => {
    expect(buildHostWorkspaceRoute("local", "164")).toBe("/h/local/workspace/164");
  });

  it("builds base64url workspace routes for legacy paths", () => {
    expect(buildHostWorkspaceRoute("local", "/tmp/repo")).toBe(
      "/h/local/workspace/b64_L3RtcC9yZXBv",
    );
  });

  it("builds host root routes", () => {
    expect(buildHostRootRoute("local")).toBe("/h/local");
  });

  it("parses workspace open intent from pathname query", () => {
    expect(
      parseHostWorkspaceOpenIntentFromPathname("/h/local/workspace/164?open=agent%3Aagent-1"),
    ).toEqual({
      kind: "agent",
      agentId: "agent-1",
    });
    expect(parseWorkspaceOpenIntent("terminal:term-1")).toEqual({
      kind: "terminal",
      terminalId: "term-1",
    });
    expect(parseWorkspaceOpenIntent("draft:new")).toEqual({
      kind: "draft",
      draftId: "new",
    });
    expect(parseWorkspaceOpenIntent("file:c3JjL2luZGV4LnRz")).toEqual({
      kind: "file",
      path: "src/index.ts",
    });
    expect(parseWorkspaceOpenIntent("setup:L3RtcC9yZXBv")).toEqual({
      kind: "setup",
      workspaceId: "/tmp/repo",
    });
  });

  it("uses the plain workspace route when workspace context is provided", () => {
    expect(buildHostAgentDetailRoute("local", "agent-1", "164")).toBe(
      "/h/local/workspace/164?open=agent%3Aagent-1",
    );
  });

  it("builds workspace routes with a one-shot open intent", () => {
    expect(buildHostWorkspaceOpenRoute("local", "164", "draft:new")).toBe(
      "/h/local/workspace/164?open=draft%3Anew",
    );
  });

  it("builds a global new workspace route without a source directory", () => {
    expect(buildHostNewWorkspaceRoute("local")).toBe("/h/local/new");
  });

  it("builds a project shortcut new workspace route with initial project context", () => {
    expect(
      buildHostNewWorkspaceRoute("local", "/repo/project", {
        displayName: "Project",
        projectId: "project-1",
      }),
    ).toBe("/h/local/new?dir=%2Frepo%2Fproject&name=Project&projectId=project-1");
  });

  it("round-trips URL-safe IDs through encode/decode", () => {
    const ids = ["1", "40", "164", "9999", "workspace-1", "opaque_id.v2~test"];
    for (const id of ids) {
      const encoded = encodeWorkspaceIdForPathSegment(id);
      const decoded = decodeWorkspaceIdFromPathSegment(encoded);
      expect(decoded).toBe(id);
    }
  });

  it("round-trips opaque IDs with reserved characters through base64 encoding", () => {
    const id = "  team/setup:id#1  ";
    const encoded = encodeWorkspaceIdForPathSegment(id);
    expect(encoded).toBe("b64_dGVhbS9zZXR1cDppZCMx");
    expect(decodeWorkspaceIdFromPathSegment(encoded)).toBe("team/setup:id#1");
  });
});

describe("projects settings routes", () => {
  it("buildProjectsSettingsRoute returns /settings/projects", () => {
    expect(buildProjectsSettingsRoute()).toBe("/settings/projects");
  });

  it("buildProjectSettingsRoute encodes a remote project key as a single segment", () => {
    expect(buildProjectSettingsRoute("remote:github.com/acme/app")).toBe(
      "/settings/projects/remote%3Agithub.com%2Facme%2Fapp",
    );
  });

  it("buildProjectSettingsRoute encodes a local repo-root key", () => {
    expect(buildProjectSettingsRoute("/Users/me/dev/paseo")).toBe(
      "/settings/projects/%2FUsers%2Fme%2Fdev%2Fpaseo",
    );
  });

  it("project keys round-trip through decodeURIComponent", () => {
    const projectKey = "remote:github.com/acme/app";
    const route = buildProjectSettingsRoute(projectKey);
    const segment = route.slice("/settings/projects/".length);
    expect(decodeURIComponent(segment)).toBe(projectKey);
  });
});

describe("host settings section slugs", () => {
  it("keeps current host settings sections", () => {
    expect(normalizeHostSectionSlug("connections")).toBe("connections");
    expect(normalizeHostSectionSlug("agents")).toBe("agents");
    expect(normalizeHostSectionSlug("workspaces")).toBe("workspaces");
    expect(normalizeHostSectionSlug("providers")).toBe("providers");
    expect(normalizeHostSectionSlug("usage")).toBe("usage");
    expect(normalizeHostSectionSlug("host")).toBe("host");
  });

  it("maps old host settings sections to their new names", () => {
    expect(normalizeHostSectionSlug("orchestration")).toBe("agents");
    expect(normalizeHostSectionSlug("daemon")).toBe("host");
  });
});

describe("isSettingsPathname", () => {
  it("is true for the settings root and any settings sub-route", () => {
    expect(isSettingsPathname("/settings")).toBe(true);
    expect(isSettingsPathname("/settings/general")).toBe(true);
    expect(isSettingsPathname("/settings/hosts/local/providers")).toBe(true);
    expect(isSettingsPathname("/settings/general?from=topbar")).toBe(true);
  });

  it("is false for non-settings routes and false-prefix lookalikes", () => {
    expect(isSettingsPathname("/")).toBe(false);
    expect(isSettingsPathname("/welcome")).toBe(false);
    expect(isSettingsPathname("/h/local/workspace/ws-1")).toBe(false);
    expect(isSettingsPathname("/settings-export")).toBe(false);
  });
});

describe("parseSettingsRoute", () => {
  it("returns null for non-settings routes", () => {
    expect(parseSettingsRoute("/h/local/workspace/ws-1")).toBeNull();
    expect(parseSettingsRoute("/welcome")).toBeNull();
  });

  it("parses the settings root", () => {
    expect(parseSettingsRoute("/settings")).toEqual({ kind: "root" });
  });

  it("parses an app section", () => {
    expect(parseSettingsRoute("/settings/general")).toEqual({ kind: "app", section: "general" });
    expect(parseSettingsRoute("/settings/about")).toEqual({ kind: "app", section: "about" });
  });

  it("falls back to root for an unknown app section", () => {
    expect(parseSettingsRoute("/settings/bogus")).toEqual({ kind: "root" });
  });

  it("parses a host section and decodes the server id", () => {
    expect(parseSettingsRoute("/settings/hosts/local/providers")).toEqual({
      kind: "host",
      serverId: "local",
      section: "providers",
    });
    expect(parseSettingsRoute("/settings/hosts/my%20mac/usage")).toEqual({
      kind: "host",
      serverId: "my mac",
      section: "usage",
    });
  });

  it("normalizes a legacy host section slug", () => {
    expect(parseSettingsRoute("/settings/hosts/local/daemon")).toEqual({
      kind: "host",
      serverId: "local",
      section: "host",
    });
  });

  it("parses a host root (no section)", () => {
    expect(parseSettingsRoute("/settings/hosts/local")).toEqual({
      kind: "hostRoot",
      serverId: "local",
    });
  });

  it("parses the projects list and a single project", () => {
    expect(parseSettingsRoute("/settings/projects")).toEqual({ kind: "projects" });
    expect(parseSettingsRoute("/settings/projects/remote%3Agithub.com%2Facme")).toEqual({
      kind: "project",
      projectKey: "remote:github.com/acme",
    });
  });
});
