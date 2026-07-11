import { describe, expect, test } from "vitest";
import { selectHostConnectionTone } from "./connection-tone";

describe("selectHostConnectionTone", () => {
  test("maps online runtime state to the online tone", () => {
    expect(selectHostConnectionTone("online")).toBe("online");
  });

  test("maps idle and connecting runtime states to the connecting tone", () => {
    expect(selectHostConnectionTone("idle")).toBe("connecting");
    expect(selectHostConnectionTone("connecting")).toBe("connecting");
  });

  test("maps offline and error runtime states to the offline tone", () => {
    expect(selectHostConnectionTone("offline")).toBe("offline");
    expect(selectHostConnectionTone("error")).toBe("offline");
  });
});
