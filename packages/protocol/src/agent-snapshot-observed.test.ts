import { describe, expect, it } from "vitest";

import { AgentSnapshotPayloadSchema } from "./messages.js";

// `observed` marks an agent that the daemon surfaces by watching a provider's
// own internal subagent (Claude Task / Codex sub-agent) rather than one Paseo
// runs. The client renders observed agents read-only. The field is additive and
// optional so old daemons (which never send it) still parse, and old clients
// ignore it.
const BASE_SNAPSHOT = {
  id: "agent-123",
  provider: "claude",
  cwd: "/tmp/project",
  model: "claude-opus",
  thinkingOptionId: null,
  effectiveThinkingOptionId: null,
  createdAt: "2026-06-27T12:00:00.000Z",
  updatedAt: "2026-06-27T12:00:00.000Z",
  lastUserMessageAt: null,
  status: "running",
  capabilities: {
    supportsStreaming: true,
    supportsSessionPersistence: true,
    supportsDynamicModes: true,
    supportsMcpServers: true,
    supportsReasoningStream: true,
    supportsToolInvocations: true,
  },
  currentModeId: null,
  availableModes: [],
  pendingPermissions: [],
  persistence: null,
  title: null,
  labels: {},
} as const;

describe("agent snapshot observed flag", () => {
  it("leaves observed undefined when omitted (old-daemon back-compat)", () => {
    const parsed = AgentSnapshotPayloadSchema.parse(BASE_SNAPSHOT);
    expect(parsed.observed).toBeUndefined();
  });

  it("parses observed=true for provider-internal subagents", () => {
    const parsed = AgentSnapshotPayloadSchema.parse({ ...BASE_SNAPSHOT, observed: true });
    expect(parsed.observed).toBe(true);
  });
});
