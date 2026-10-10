import { createRequire } from "node:module";
import * as pluginSharedRuntime from "@getpaseo/plugin";
import * as pluginProviderRuntime from "@getpaseo/plugin/server/provider";
import * as pluginAcpRuntime from "@getpaseo/plugin/server/acp";
import * as pluginUsageRuntime from "@getpaseo/plugin/server/usage";
import * as pluginServerRuntime from "@getpaseo/plugin/server";
import * as pluginPlatformRuntime from "@getpaseo/plugin/v1";
import * as pluginPlatformServerRuntime from "@getpaseo/plugin/v1/server";
import type { ServerPluginRegistration } from "@getpaseo/plugin/v1/server";
import type { PluginServerContribution } from "@getpaseo/plugin/server";
import * as zod from "zod";
import { isPluginClientOnlySdkSpecifier } from "./plugin-sdk-specifiers.js";

const nodeRequire = createRequire(import.meta.url);

function runtimeRequire(name: string): unknown {
  if (isPluginClientOnlySdkSpecifier(name)) {
    throw new Error(`${name} is available only in plugin client code`);
  }
  if (name === "@getpaseo/plugin") return pluginSharedRuntime;
  if (name === "@getpaseo/plugin/v1") return pluginPlatformRuntime;
  if (name === "@getpaseo/plugin/v1/server") return pluginPlatformServerRuntime;
  if (name === "@getpaseo/plugin/server") return pluginServerRuntime;
  if (name === "@getpaseo/plugin/server/provider") return pluginProviderRuntime;
  if (name === "@getpaseo/plugin/server/acp") return pluginAcpRuntime;
  if (name === "@getpaseo/plugin/server/usage") return pluginUsageRuntime;
  if (name === "zod") return zod;
  if (name === "@getpaseo/plugin/client/host")
    throw new Error(`${name} is private to the app host`);
  return nodeRequire(name);
}

function evaluateDefaultExport(bundle: string): unknown {
  const evaluate: (source: string) => unknown = globalThis.eval;
  const factory = evaluate(bundle);
  if (typeof factory !== "function") throw new Error("Plugin server bundle is not executable");
  const exports = factory(runtimeRequire);
  const setup =
    exports !== null && typeof exports === "object" ? Reflect.get(exports, "default") : undefined;
  if (typeof setup !== "function") {
    throw new Error("Plugin server bundle must default export a function");
  }
  return setup;
}

// The manifest version decides which contract the default export implements; the bundle itself
// carries no type information, so each entry point states the contract it loads.
export function evaluateBundle(bundle: string): PluginServerContribution {
  return evaluateDefaultExport(bundle) as PluginServerContribution;
}

export function evaluatePlatformBundle(bundle: string): ServerPluginRegistration {
  return evaluateDefaultExport(bundle) as ServerPluginRegistration;
}
