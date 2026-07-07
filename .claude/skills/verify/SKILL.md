---
name: verify
description: Helm/Paseo 自驱验证——起 dev 栈 + 常驻 headless 浏览器，agent 自己导航/点击/截图/抓 WS 帧/读 daemon 日志来复现与验收 UI 行为。适用于「点一下就能复现」的调试、gate-3 式验收、改动后的真跑确认。
---

# Helm 自驱验证（agent 自己点、自己看）

验证 = 运行时观察。不是跑测试、不是 typecheck——是把 app 跑起来、开到改动生效的界面、亲手点出行为、截图留证。

## 两条路线，先选对

1. **交互式会话（本技能主体）**：复现 bug、验收新功能、探索性点击。常驻一个 headless 浏览器，逐步驱动，每步截图。
2. **回归 e2e（已有成熟设施，别重造）**：`packages/app/e2e/` 有 ~70 个 spec + 隔离 daemon/metro 的 global-setup + fixtures 自动 seed。写可重复回归时直接加 spec：
   ```bash
   cd packages/app && npx playwright test e2e/<file>.spec.ts --project='Desktop Chrome'
   ```
   参考 `e2e/fixtures.ts`（localStorage seed 手法）、`e2e/helpers/seed-client.ts`（临时 repo + workspace）。

## 交互式会话：三步起

```bash
# 1) dev 栈（若 lsof 查到 7070/8081 已监听则跳过；日志落 .dev/verify/)
npm run dev:server > .dev/verify/dev-server.log 2>&1 &   # daemon
npm run dev:app    > .dev/verify/dev-app.log    2>&1 &   # Expo web :8081

# 2) 常驻浏览器（后台任务；首次冷 Metro 打包可达 2-4 分钟）
node .claude/skills/verify/scripts/session.mjs start
# 就绪标志：stdout 出现 "verify session up"

# 3) 驱动
node .claude/skills/verify/scripts/session.mjs shot <name>       # 截当前页
node .claude/skills/verify/scripts/session.mjs run <step.mjs>    # 跑一步脚本
node .claude/skills/verify/scripts/session.mjs console [n]       # 尾读页面 console 错误/警告
node .claude/skills/verify/scripts/session.mjs status            # 会话还活着吗
```

Step 文件契约（放 `.dev/verify/steps/`，随写随跑，浏览器状态在步骤间保持）：

```js
export default async function step(page, ctx) {
  await page.getByTestId("file-tree-refresh").click();
  await ctx.shot("after-refresh"); // 落 .dev/verify/shots/<ts>-<name>.png
  ctx.log("anything"); // 打到 stdout
}
```

步骤抛错会自动截 `ERROR-<step>.png` 再退出——先看这张图再改脚本。

## 证据从哪拿

| 证据                                                                                         | 位置                                                                                                |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 截图                                                                                         | `.dev/verify/shots/`                                                                                |
| 页面 console error/warning + pageerror                                                       | `.dev/verify/console.log`（常驻进程持续追加）                                                       |
| daemon 日志（RPC 慢查询看 `ws_slow_request`，请求计时看 `ws_runtime_metrics` 的 latency 段） | `.dev/paseo-home/daemon.log`                                                                        |
| WS 帧（server_info/features、RPC 往返）                                                      | step 里 `page.on("websocket", ...)` **先挂监听再 `page.reload()`**——只能看到挂监听之后新建的 socket |
| 磁盘真相（文件写类操作）                                                                     | 直接 `ls`/`cat` 断言，别只信 UI                                                                     |

## 本仓库 gotchas（血泪清单）

- **daemon 端口以 `.dev/paseo-home/config.json` 的 `daemon.listen` 为准**（本机是 7070；docs/development.md 写的 6768 是默认值不是事实）。session.mjs 已自动读取。
- **永不碰 6767**（打包版守护进程）。session.mjs 已对 :6767 做 route/WS 双重硬屏蔽，别移除。
- **app 连接 daemon 靠 localStorage seed**：key `@paseo:daemon-registry`，host 形如 `{serverId(读 .dev/paseo-home/server-id), connections:[{id:"direct:<ep>", type:"directTcp", endpoint}]...}`。session.mjs start 首次自动 seed；换 daemon 用 `--reseed`。
- **顶栏三个 toggle 没有 testID/aria-label**——只能 `[data-testid="top-bar"] [role="button"]` 按位置取 `nth(count-2)`＝文件树、`nth(count-1)`＝右栏；**重载后按钮数量会短暂变化**，要 waitFor + 失败重试，别一把梭。
- **文件树可用 testid**：`file-tree-search-toggle / file-tree-pick-directory / file-tree-collapse-all / file-tree-refresh`、菜单项 `file-tree-menu-<id>`（id 如 new-file/rename/delete/find-in-files...）。**树行没有 testid**，用 `getByText(name, {exact:true})`。
- **右键**： `.click({ button: "right" })` 即可唤起自绘菜单；测「空白区」菜单前先 `collapse-all`，否则坐标极易砸在行上（行高约 28px），测出假结果。
- **web 端删除确认是原生 `window.confirm`**：session.mjs 的常驻端已挂 no-op dialog 监听（关掉它的自动 dismiss），**step 里用 `page.once("dialog", d => void d.accept())` 接管**即可走确认分支；step 若触发了弹窗又不处理，弹窗会一直挂着（reload 恢复）。不要两处同时 accept 同一弹窗（会抛 Protocol error）。
- **首次 `page.goto` 冷 Metro 要给 240s 超时**；后续热载很快。
- 文件树在 **home 路由就能开**（`home.tsx` 提供伪 workspaceKey `<serverId>:__home__`）；无对话目录时树根落桌面属预期。
- 会话浏览器 profile 持久在 `.dev/verify/chrome-profile`（localStorage 存活跨重启）；删掉该目录 = 全新用户。**壳的开合状态（文件树/右栏）也持久化**——重载后面板可能本来就开着，点 toggle 前先查目标元素是否已在（幂等开启），否则会把它点关。
- **`npm run dev:server` 不 watch server 源码**（只 watch protocol/client）——改了 `packages/server/src` 必须手动重启 daemon（kill 7070 上的进程再起）。daemon 重启后活页面的 WS 断线，步骤前先 `page.reload()`。
- **RN-web 的 `hitSlop` 对鼠标点击无效**（DOM 命中测试止于元素盒）。要放大点击区必须给 Pressable **真实内边距**（外层大盒 + 负 margin 保布局 + 内层视觉芯片）。验证命中区就量 testid 元素的 boundingBox。
- **下拉菜单（DropdownMenu）开着时有全屏 backdrop**（aria-label="Menu backdrop"）拦所有点击——步骤里切模式等操作若卡在 "intercepts pointer events"，先 `page.keyboard.press("Escape")` 清场。
- 服务端搜索测试可用 `rgBinaryPath` seam 指向脚本化的假 rg（吐一条命中后 hang / exit 2），配 `rgTimeoutMs` 毫秒级验证超时/退化路径。

## 报告格式

按全局 verify 技能的 Verification 报告格式输出：Verdict / Claim / Method / Steps（✅❌⚠️🔍 每步一行 + 证据）/ Findings。截图路径要引用；磁盘/日志证据内联。
