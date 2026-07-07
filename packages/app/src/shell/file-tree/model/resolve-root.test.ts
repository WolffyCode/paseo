import { describe, expect, it } from "vitest";
import { resolveTreeRoot } from "./resolve-root";

describe("resolveTreeRoot", () => {
  it("prefers an externally supplied root over everything else", () => {
    expect(
      resolveTreeRoot({ externalRoot: "/work/project", conversationRoot: "/conv/dir" }),
    ).toEqual({ kind: "path", path: "/work/project" });
  });

  it("falls back to the conversation root when no external root is supplied", () => {
    expect(resolveTreeRoot({ externalRoot: null, conversationRoot: "/conv/dir" })).toEqual({
      kind: "path",
      path: "/conv/dir",
    });
  });

  it("signals a desktop resolution when neither external nor conversation root exists", () => {
    expect(resolveTreeRoot({ externalRoot: null, conversationRoot: null })).toEqual({
      kind: "needDesktop",
    });
  });

  it("treats a blank external root as absent and falls through to conversation", () => {
    expect(resolveTreeRoot({ externalRoot: "   ", conversationRoot: "/conv/dir" })).toEqual({
      kind: "path",
      path: "/conv/dir",
    });
  });

  it("treats a blank conversation root as absent and falls through to desktop", () => {
    expect(resolveTreeRoot({ externalRoot: null, conversationRoot: "" })).toEqual({
      kind: "needDesktop",
    });
  });
});
