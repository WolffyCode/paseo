import { describe, expect, test } from "vitest";
import {
  buildNewConversationRoute,
  buildOpenProjectRoute,
  buildProjectConversationRoute,
  ConversationTreeRouteInputError,
} from "./routes";

describe("conversation tree routes", () => {
  test("builds the global new-conversation route without project preselection", () => {
    expect(buildNewConversationRoute(" server ")).toBe("/h/server/new");
  });

  test("builds an encoded project-preselected new-conversation route", () => {
    expect(
      buildProjectConversationRoute({
        serverId: "host/id",
        sourceDirectory: "/repo/a b",
        projectKey: "project/id",
        projectName: "My Project",
      }),
    ).toBe("/h/host%2Fid/new?dir=%2Frepo%2Fa+b&name=My+Project&projectId=project%2Fid");
  });

  test("builds the existing open-project route and rejects blank host identity", () => {
    expect(buildOpenProjectRoute("server")).toBe("/h/server/open-project");
    expect(() => buildOpenProjectRoute("   ")).toThrow(ConversationTreeRouteInputError);
  });
});
