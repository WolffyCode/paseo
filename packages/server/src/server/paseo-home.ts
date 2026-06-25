import os from "node:os";
import path from "node:path";
import { ensurePrivateDirectory } from "./private-files.js";

function expandHomeDir(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  if (input === "~") {
    return os.homedir();
  }
  return input;
}

export function resolvePaseoHome(env: NodeJS.ProcessEnv = process.env): string {
  // Helm reads HELM_HOME first (its own identity), then falls back to PASEO_HOME
  // (set by the dev scripts) and finally its own default home, so it never shares
  // ~/.paseo with an upstream Paseo install.
  const raw = env.HELM_HOME ?? env.PASEO_HOME ?? "~/.helm";
  const resolved = path.resolve(expandHomeDir(raw));
  ensurePrivateDirectory(resolved);
  return resolved;
}
