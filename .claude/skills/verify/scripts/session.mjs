#!/usr/bin/env node
// Interactive verify browser for agents. Keeps ONE headless chromium alive so
// ad-hoc step scripts can drive the app like a human clicking around.
//
//   node session.mjs start [--url http://localhost:8081] [--reseed]
//   node session.mjs run <step.mjs>     # step exports: default async (page, ctx) => {}
//   node session.mjs shot <name>        # screenshot current page
//   node session.mjs status             # is the session up? current URL?
//   node session.mjs console [n]        # tail captured console/pageerror lines
//
// State lives under .dev/verify/ (profile, shots, console.log). The session
// seeds the app's daemon registry to the DEV daemon (127.0.0.1:6768, server-id
// from .dev/paseo-home/server-id) and hard-blocks 127.0.0.1:6767 so it can
// never touch the production daemon.
import { chromium } from "playwright";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const VERIFY_DIR = path.join(REPO_ROOT, ".dev/verify");
const SHOTS_DIR = path.join(VERIFY_DIR, "shots");
const PROFILE_DIR = path.join(VERIFY_DIR, "chrome-profile");
const CONSOLE_LOG = path.join(VERIFY_DIR, "console.log");
const CDP_PORT = Number(process.env.VERIFY_CDP_PORT ?? 9333);
const CDP_URL = `http://127.0.0.1:${CDP_PORT}`;
const DEFAULT_APP_URL = process.env.VERIFY_APP_URL ?? "http://localhost:8081";
const DEV_DAEMON_ENDPOINT = process.env.VERIFY_DAEMON_ENDPOINT ?? readDevDaemonEndpoint();

// The dev daemon's listen address lives in .dev/paseo-home/config.json (docs
// say 6768, but the checkout config wins — this one runs on 7070).
function readDevDaemonEndpoint() {
  const configPath = path.join(REPO_ROOT, ".dev/paseo-home/config.json");
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    if (typeof config?.daemon?.listen === "string") return config.daemon.listen;
  } catch {
    // fall through to the documented default
  }
  return "127.0.0.1:6768";
}

for (const dir of [VERIFY_DIR, SHOTS_DIR]) mkdirSync(dir, { recursive: true });

function ts() {
  return new Date().toISOString().slice(11, 23);
}

function logConsoleLine(line) {
  appendFileSync(CONSOLE_LOG, `${ts()} ${line}\n`);
}

function buildSeedHost() {
  const serverIdPath = path.join(REPO_ROOT, ".dev/paseo-home/server-id");
  if (!existsSync(serverIdPath)) {
    throw new Error(
      `Missing ${serverIdPath} — start the dev daemon once first (npm run dev:server).`,
    );
  }
  const serverId = readFileSync(serverIdPath, "utf8").trim();
  const nowIso = new Date().toISOString();
  const connection = {
    id: `direct:${DEV_DAEMON_ENDPOINT}`,
    type: "directTcp",
    endpoint: DEV_DAEMON_ENDPOINT,
  };
  return {
    serverId,
    label: "dev-verify",
    connections: [connection],
    preferredConnectionId: connection.id,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

async function guardContext(context) {
  // Never let a verify session reach the production daemon on :6767.
  await context.route(/:(6767)\b/, (route) => route.abort());
  await context.routeWebSocket(/:(6767)\b/, async (ws) => {
    await ws.close({ code: 1008, reason: "verify session blocked :6767" });
  });
}

function attachConsoleCapture(context) {
  const wire = (page) => {
    page.on("console", (message) => {
      const type = message.type();
      if (type === "error" || type === "warning") {
        logConsoleLine(`[console:${type}] ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => logConsoleLine(`[pageerror] ${error.message}`));
    // Deliberate no-op dialog listener: it disables THIS (persistent) client's auto-dismiss so a
    // step script's own page.once("dialog") handler owns the dialog. Without it, the persistent
    // connection dismisses every confirm() before the step can accept it. Steps that trigger a
    // dialog MUST handle it, or it stays open (Escape/reload recovers).
    page.on("dialog", (dialog) => logConsoleLine(`[dialog] ${dialog.type()}: ${dialog.message()}`));
  };
  for (const page of context.pages()) wire(page);
  context.on("page", wire);
}

async function cmdStart(args) {
  const url = argValue(args, "--url") ?? DEFAULT_APP_URL;
  const reseed = args.includes("--reseed");
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 1440, height: 900 },
    args: [`--remote-debugging-port=${CDP_PORT}`],
  });
  await guardContext(context);
  attachConsoleCapture(context);
  const page = context.pages()[0] ?? (await context.newPage());
  // First hit on a cold Metro compiles the whole web bundle — allow minutes.
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240_000 });

  const host = buildSeedHost();
  const seeded = await page.evaluate(
    ({ seedHost, forceReseed }) => {
      const key = "@paseo:daemon-registry";
      if (!forceReseed && localStorage.getItem(key)) return false;
      localStorage.setItem(key, JSON.stringify([seedHost]));
      return true;
    },
    { seedHost: host, forceReseed: reseed },
  );
  if (seeded) await page.reload({ waitUntil: "domcontentloaded", timeout: 240_000 });
  logConsoleLine(`[session] started url=${url} seeded=${seeded}`);
  console.log(`verify session up: ${url} (CDP ${CDP_URL}) seeded=${seeded}`);
  // Keep the process alive; the harness runs this in the background.
  await new Promise(() => {});
}

async function connect() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  if (!context) throw new Error("No browser context — is the session started?");
  const pages = context.pages().filter((p) => !p.url().startsWith("devtools://"));
  const page = pages[pages.length - 1];
  if (!page) throw new Error("No page in verify session.");
  return { browser, context, page };
}

function shotPath(name) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(SHOTS_DIR, `${stamp}-${name}.png`);
}

async function cmdRun(args) {
  const stepFile = args[0];
  if (!stepFile) throw new Error("usage: session.mjs run <step.mjs>");
  const { browser, page } = await connect();
  const ctx = {
    shot: async (name) => {
      const file = shotPath(name);
      await page.screenshot({ path: file });
      console.log(`shot: ${file}`);
      return file;
    },
    log: (...parts) => console.log(...parts),
  };
  try {
    const mod = await import(path.resolve(stepFile));
    await mod.default(page, ctx);
    await ctx.shot(path.basename(stepFile, ".mjs"));
  } catch (error) {
    // Always leave visual evidence of the failure state before rethrowing.
    await ctx.shot(`ERROR-${path.basename(stepFile, ".mjs")}`).catch(() => {});
    throw error;
  } finally {
    await browser.close(); // detaches CDP; the session browser keeps running
  }
}

async function cmdShot(args) {
  const name = args[0] ?? "page";
  const { browser, page } = await connect();
  try {
    const file = shotPath(name);
    await page.screenshot({ path: file });
    console.log(`shot: ${file} url=${page.url()}`);
  } finally {
    await browser.close();
  }
}

async function cmdStatus() {
  try {
    const { browser, page } = await connect();
    console.log(`up url=${page.url()}`);
    await browser.close();
  } catch (error) {
    console.log(`down (${error.message})`);
    process.exitCode = 1;
  }
}

function cmdConsole(args) {
  const n = Number(args[0] ?? 40);
  if (!existsSync(CONSOLE_LOG)) {
    console.log("(no console log yet)");
    return;
  }
  const lines = readFileSync(CONSOLE_LOG, "utf8").trimEnd().split("\n");
  console.log(lines.slice(-n).join("\n"));
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const [command, ...rest] = process.argv.slice(2);
const commands = {
  start: cmdStart,
  run: cmdRun,
  shot: cmdShot,
  status: cmdStatus,
  console: cmdConsole,
};
const handler = commands[command];
if (!handler) {
  console.error(`unknown command: ${command ?? "(none)"} — expected start|run|shot|status|console`);
  process.exit(2);
}
await handler(rest);
