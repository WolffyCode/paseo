import AsyncStorage from "@react-native-async-storage/async-storage";
import { reaction } from "mobx";
import {
  parsePersistedShellState,
  partializeShellState,
  SHELL_STATE_STORAGE_KEY,
  shellModel,
} from "./shell-model";

// Side-effect wiring that persists the shell's layout slice to AsyncStorage and restores it
// on cold start. Kept OUT of ShellModel so the model stays storage-free and unit-testable
// (`new ShellModel()` touches no I/O); this module is imported once from the shell route, so
// it runs only in the app where AsyncStorage exists. Hydrate loads first; a reaction then
// writes the partialized slice on every change.

let started = false;

// Idempotent: start hydration + the persist reaction exactly once.
export function startShellPersistence(): void {
  if (started) {
    return;
  }
  started = true;
  void hydrateThenPersist();
}

// Load the stored slice (tolerating absent/corrupt data via parsePersistedShellState), then
// arm a reaction that writes the layout slice whenever it changes. The reaction is wired
// after the load settles so hydrate itself never triggers an immediate redundant write.
async function hydrateThenPersist(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(SHELL_STATE_STORAGE_KEY);
    if (raw != null) {
      const slice = parsePersistedShellState(JSON.parse(raw));
      if (slice) {
        shellModel.hydrate(slice);
      }
    }
  } catch (error) {
    console.error("[shell] failed to load persisted layout", error);
  }
  reaction(
    () => partializeShellState(shellModel),
    (slice) => {
      void AsyncStorage.setItem(SHELL_STATE_STORAGE_KEY, JSON.stringify(slice)).catch((error) => {
        console.error("[shell] failed to persist layout", error);
      });
    },
  );
}
