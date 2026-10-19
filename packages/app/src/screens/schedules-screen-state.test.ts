import { describe, expect, it } from "vitest";
import { resolveSchedulesScreenBodyState } from "./schedules-screen-state";
import { createSchedulesScreenModel } from "@/schedules/screen-model";

it("retains schedule filters across activity hops and clears a removed host", () => {
  const model = createSchedulesScreenModel("all");
  model.selectHost("host-one");
  model.setStatusFilter("ended");
  model.openCreate();
  model.closeForm();
  model.applyHosts(["host-one"]);
  expect(model.getSnapshot()).toEqual({
    form: { mode: "closed" },
    selectedHost: "host-one",
    statusFilter: "ended",
  });
  model.applyHosts([]);
  expect(model.getSnapshot().selectedHost).toBe("all");
  model.dispose();
});

describe("resolveSchedulesScreenBodyState", () => {
  it("routes failed loading state to the retry UI instead of the spinner", () => {
    expect(
      resolveSchedulesScreenBodyState({
        loadState: { status: "loading" },
        showLoadError: true,
      }),
    ).toEqual({ kind: "load-error" });
  });
});
