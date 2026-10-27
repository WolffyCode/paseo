const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { app, BrowserWindow, session } = require("electron");
const { BrowserTaskManager } = require("../dist/features/browser-task-manager/index.js");
const { registerAttachedPaseoBrowser } = require("../dist/features/browser-webviews/index.js");

const appearance = {
  colorScheme: "light",
  productLogo: { viewBox: "0 0 24 24", d: "M4 4h16v16H4z" },
  strings: {
    locale: "zh-CN",
    title: "任务管理器",
    categories: { tabsAndExtensions: "标签页和扩展程序", browser: "浏览器", all: "所有任务" },
    searchPlaceholder: "搜索",
    searchAccessibleName: "从列表中搜索任何进程。",
    clearSearch: "清除搜索字词",
    endTask: "结束任务",
    endTaskAccessibleName: "结束突出显示的任务。",
    tasksEnded: "任务已结束。",
    tasksNotEnded: "未能结束任务。",
    columns: {
      task: "任务",
      profile: "个人资料",
      memory: "内存占用",
      cpu: "CPU",
      network: "网络",
      processId: "进程 ID",
      idleWakeups: "空闲唤醒",
    },
    titles: {
      browser: "浏览器",
      gpu: "GPU 进程",
      renderer: "渲染程序",
      utility: "实用程序：$1",
      tab: "标签页：$1",
      subframe: "子框架：$1",
      extension: "扩展程序：$1",
      serviceWorker: "Service Worker：$1",
    },
    notAvailable: "–",
    byteUnits: { bytes: "$1 B", kilobytes: "$1 KB", megabytes: "$1 MB", gigabytes: "$1 GB" },
    profileName: "测试资料",
  },
};

async function waitFor(check, message) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${message}`);
}

exports.runBrowserTaskManagerGroup = async function runBrowserTaskManagerGroup(outDir) {
  // Exercise the production windows without taking keyboard focus from the user's app.
  const keepInactive = (_event, win) => {
    win.show = () => win.showInactive();
    win.focus = () => {};
  };
  app.on("browser-window-created", keepInactive);
  const profileSession = session.fromPartition("task-manager-harness");
  const manager = new BrowserTaskManager(profileSession);
  await manager.start();
  const host = new BrowserWindow({
    show: false,
    width: 900,
    height: 650,
    webPreferences: {
      preload: path.resolve(__dirname, "../dist/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  let guest;
  host.webContents.on("did-attach-webview", (_event, contents) => {
    guest = contents;
    assert.equal(
      registerAttachedPaseoBrowser({
        sender: host.webContents,
        profileSession,
        browserId: "fixture-page",
        workspaceId: "fixture-workspace",
        webContentsId: contents.id,
        findWebContents: () => contents,
      }),
      true,
    );
  });
  const fixtureUrl =
    "data:text/html," +
    encodeURIComponent("<title>Task manager fixture</title><h1>Page survives reload</h1>");
  const hostHtml = `<html><body><webview partition="task-manager-harness" style="width:800px;height:500px" src="${fixtureUrl}"></webview></body></html>`;
  await host.loadURL("data:text/html," + encodeURIComponent(hostHtml));
  await waitFor(() => guest && guest.getTitle() === "Task manager fixture", "guest load");
  await host.webContents.executeJavaScript(`
    window.activatedBrowserIds = [];
    void window.paseoDesktop.events.on("browser-task-manager-activate", (payload) => window.activatedBrowserIds.push(payload.browserId));
  `);
  const open = (nextAppearance = appearance) =>
    host.webContents.executeJavaScript(
      `window.paseoDesktop.browser.taskManager.open(${JSON.stringify({ browserId: "fixture-page", appearance: nextAppearance })})`,
    );
  const findManagerWindow = () => BrowserWindow.getAllWindows().find((win) => win.id !== host.id);
  await open();
  let window = findManagerWindow();
  assert.ok(window);
  let contents = window.webContents;
  const evaluate = (code) => contents.executeJavaScript(code);
  await waitFor(
    () => evaluate(`document.querySelectorAll('.tm-row').length > 0`),
    "initial task sample",
  );
  assert.equal(
    await evaluate(
      `document.querySelector('.tm-row.is-selected')?.textContent.includes('Task manager fixture')`,
    ),
    true,
  );
  assert.equal(await evaluate(`document.querySelector('.tm-end').disabled`), false);
  await evaluate(
    `document.querySelector('.tm-row.is-selected').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`,
  );
  await waitFor(
    () => host.webContents.executeJavaScript(`window.activatedBrowserIds.length === 1`),
    "page activation",
  );
  assert.equal(
    await host.webContents.executeJavaScript(`window.activatedBrowserIds[0]`),
    "fixture-page",
  );

  await evaluate(`document.querySelectorAll('.tm-tab')[1].click()`);
  await evaluate(
    `Array.from(document.querySelectorAll('.tm-row')).find(row => row.querySelector('.tm-cell-text')?.textContent === '浏览器').dispatchEvent(new MouseEvent('mousedown', { bubbles:true, button:0 }))`,
  );
  assert.equal(
    await evaluate(`document.querySelector('.tm-end').disabled`),
    true,
    "browser process must not be killable",
  );
  await evaluate(
    `const input = document.querySelector('input'); input.value='unmatched'; input.dispatchEvent(new Event('input'));`,
  );
  await waitFor(
    () => evaluate(`document.querySelectorAll('.tm-row').length === 0`),
    "search filtering",
  );
  const originalWindowId = window.id;
  await open({ ...appearance, colorScheme: "dark" });
  assert.equal(findManagerWindow().id, originalWindowId, "one task manager window");
  await waitFor(
    () =>
      evaluate(
        `document.documentElement.dataset.scheme === 'dark' && document.querySelector('.tm-row.is-selected')?.textContent.includes('Task manager fixture')`,
      ),
    "reopen selects page through filters",
  );
  assert.equal(await evaluate(`document.querySelector('input').value`), "");
  await delay(400);
  assert.equal(
    await evaluate(
      `Math.abs(document.querySelector('.tm-tab-bar').offsetLeft - document.querySelector('.tm-tab[aria-selected="true"]').offsetLeft) < 1`,
    ),
    true,
    "category underline follows rapid reopen",
  );
  await fs.writeFile(
    path.join(outDir, "task-manager-dark.png"),
    (await contents.capturePage()).toPNG(),
  );
  await open(appearance);
  await waitFor(
    () => evaluate(`document.documentElement.dataset.scheme === 'light'`),
    "light theme update",
  );
  await delay(100);
  await fs.writeFile(
    path.join(outDir, "task-manager-light.png"),
    (await contents.capturePage()).toPNG(),
  );

  const ended = once(guest, "render-process-gone");
  await evaluate(`document.querySelector('.tm-end').click()`);
  const [, details] = await ended;
  assert.notEqual(details.reason, "clean-exit");
  assert.equal(host.isDestroyed(), false, "ending a page preserves the host");
  await waitFor(
    () => evaluate(`document.querySelector('[role=status]').textContent === '任务已结束。'`),
    "end-task feedback",
  );
  const loaded = once(guest, "did-finish-load");
  await host.webContents.executeJavaScript(`document.querySelector('webview').reload()`);
  await loaded;
  assert.equal(
    await guest.executeJavaScript("document.querySelector('h1').textContent"),
    "Page survives reload",
  );
  await open();
  await waitFor(
    () =>
      evaluate(
        `document.querySelector('.tm-row.is-selected')?.textContent.includes('Task manager fixture')`,
      ),
    "reloaded task selection",
  );

  await evaluate(
    `document.querySelectorAll('.tm-tab')[2].click(); document.querySelectorAll('[role=columnheader]')[1].click();`,
  );
  window.close();
  await waitFor(async () => {
    try {
      return (
        JSON.parse(
          await fs.readFile(
            path.join(app.getPath("userData"), "browser-task-manager.json"),
            "utf8",
          ),
        ).view.category === "all"
      );
    } catch {
      return false;
    }
  }, "saved window state");
  await open();
  window = findManagerWindow();
  contents = window.webContents;
  await waitFor(
    () => evaluate(`document.querySelectorAll('.tm-row').length > 0`),
    "reopened window",
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.tm-tab')[2].getAttribute('aria-selected')`),
    "true",
  );
  await evaluate(
    `document.querySelectorAll('.tm-tab')[2].focus(); document.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft', bubbles:true}));`,
  );
  assert.equal(
    await evaluate(`document.querySelectorAll('.tm-tab')[1].getAttribute('aria-selected')`),
    "true",
  );
  await fs.writeFile(
    path.join(outDir, "results.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        taskManager: "passed",
        checks: [
          "initial selection",
          "singleton",
          "search and category filtering",
          "theme update",
          "page activation",
          "host process protection",
          "end real guest process",
          "reload terminated guest",
          "persisted view",
          "keyboard category navigation",
        ],
      },
      null,
      2,
    ),
  );
  window.close();
  host.destroy();
  app.removeListener("browser-window-created", keepInactive);
};
