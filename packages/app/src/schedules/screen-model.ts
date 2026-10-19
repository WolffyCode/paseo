import type { ScheduleSummary } from "@getpaseo/protocol/schedule/types";
import type { ScheduleBucket } from "./schedule-derivation";

export type ScheduleFormState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; serverId: string; schedule: ScheduleSummary };

export function createSchedulesScreenModel(allHostsId: string) {
  let state = {
    form: { mode: "closed" } as ScheduleFormState,
    selectedHost: allHostsId,
    statusFilter: "runnable" as ScheduleBucket,
  };
  const listeners = new Set<() => void>();
  function publish(patch: Partial<typeof state>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    applyHosts(ids: readonly string[]) {
      if (state.selectedHost !== allHostsId && !ids.includes(state.selectedHost))
        publish({ selectedHost: allHostsId });
    },
    selectHost(selectedHost: string) {
      publish({ selectedHost });
    },
    setStatusFilter(statusFilter: ScheduleBucket) {
      publish({ statusFilter });
    },
    openCreate() {
      publish({ form: { mode: "create" } });
    },
    openEdit(schedule: ScheduleSummary & { serverId: string }) {
      publish({ form: { mode: "edit", serverId: schedule.serverId, schedule } });
    },
    closeForm() {
      publish({ form: { mode: "closed" } });
    },
    dispose() {
      listeners.clear();
    },
  };
}
