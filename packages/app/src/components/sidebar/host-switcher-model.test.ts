import { describe, expect, it } from "vitest";
import {
  type HostConnectionTone,
  selectHostConnectionTone,
} from "@/components/sidebar/host-switcher-model";

describe("selectHostConnectionTone", () => {
  // The pill, dropdown rows and status dots must agree on one of three visuals
  // (绿/橙/红). The selector collapses the five runtime connection states down to
  // that three-state vocabulary so no renderer re-implements the switch.

  it("maps an online host to the online tone", () => {
    expect(selectHostConnectionTone("online")).toBe<HostConnectionTone>("online");
  });

  it("treats connecting and the not-yet-attempted idle state as the connecting tone", () => {
    // idle reads as a transient pre-connection state, so it shows the amber
    // "connecting" dot rather than a false red "offline".
    expect(selectHostConnectionTone("connecting")).toBe<HostConnectionTone>("connecting");
    expect(selectHostConnectionTone("idle")).toBe<HostConnectionTone>("connecting");
  });

  it("treats offline and error as the offline tone", () => {
    expect(selectHostConnectionTone("offline")).toBe<HostConnectionTone>("offline");
    expect(selectHostConnectionTone("error")).toBe<HostConnectionTone>("offline");
  });
});
