import { describe, expect, test } from "vitest";

import { SessionInboundMessageSchema } from "./messages.js";
import { validateWSOutboundMessage } from "./validation/ws-outbound.js";

describe("agent storage paths protocol", () => {
  test("accepts a storage paths request for one agent", () => {
    const request = {
      type: "agent.get_storage_paths.request",
      agentId: "agent-1",
      requestId: "paths-1",
    };

    expect(SessionInboundMessageSchema.parse(request)).toEqual(request);
  });

  test("delivers resolved paths and a missing provider session to the client", () => {
    const message = {
      type: "agent.get_storage_paths.response",
      payload: {
        requestId: "paths-1",
        agentId: "agent-1",
        recordPath: "/home/dev/.paseo/agents/home-dev-project/agent-1.json",
        providerSessionPath: null,
        error: null,
      },
    };

    expect(validateWSOutboundMessage({ type: "session", message })).toEqual({
      success: true,
      data: { type: "session", message },
    });
  });

  test("delivers a failed lookup with its error", () => {
    const message = {
      type: "agent.get_storage_paths.response",
      payload: {
        requestId: "paths-2",
        agentId: "missing-agent",
        recordPath: null,
        providerSessionPath: null,
        error: "Agent not found: missing-agent",
      },
    };

    expect(validateWSOutboundMessage({ type: "session", message })).toEqual({
      success: true,
      data: { type: "session", message },
    });
  });
});
