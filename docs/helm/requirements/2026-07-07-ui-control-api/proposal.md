# 方案 · UI 控制能力开放（目录树 / 右侧边栏 → AI 可控）

> 日期：2026-07-07 · 状态：**提案（gate-1 前草案，供董事长评审）** · 作者：总监
> 关联：`2026-06-30-file-tree`（目录树已落地，含公共面 `FileTreeController`）· `docs/architecture.md`（WS 协议/会话）· `packages/server/src/server/agent/mcp-server.ts`（daemon 既有 MCP 工具面）

---

## 1. 目标场景（董事长口述，作为验收蓝本）

> AI 新建一个文件 → 我让 AI「打开这个文件」→ 右侧目录树自动打开、定位到文件所在目录（**若文件在当前工作区内，树根 = 工作区根目录**，否则树根 = 文件所在目录）→ 文件在**右侧边栏**打开 → 我在右侧边栏里改内容，改动**同步回磁盘** → 右侧边栏多文件时，切到一个**工作区外**的文件，目录树**同步切根**到该文件所在目录。

拆出的能力需求：

| #   | 能力                                             | 归属模块           | 谁调用                  |
| --- | ------------------------------------------------ | ------------------ | ----------------------- |
| C1  | 打开 / 关闭 / 切换目录树面板                     | 壳（shell）        | AI、右栏联动            |
| C2  | 目录树定位（reveal）：智能定根 + 展开祖先 + 选中 | 目录树             | AI、右栏联动            |
| C3  | 目录树搜索（打开搜索面板 + 注入 query/mode）     | 目录树             | AI                      |
| C4  | 指定目录为树根（showDirectory）                  | 目录树             | AI、对话侧（既有需求⑧） |
| C5  | 右侧边栏打开文件（可编辑 tab）                   | 右栏（未来里程碑） | AI、目录树              |
| C6  | 右栏编辑 → 写回磁盘                              | 右栏 + daemon fs   | 用户                    |
| C7  | 右栏 tab 切换 → 目录树联动切根                   | 壳级编排           | 自动                    |

## 2. 现状盘点（已有的积木，全部复用不重造）

| 积木                                                                     | 位置                                               | 现状                                                                     |
| ------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------ |
| 目录树公共面 `FileTreeController`（showDirectory/rootPath/selectedPath） | `shell/file-tree/model/file-tree-public.ts`        | ✅ 已落地（需求⑧）                                                       |
| 树内 `revealPath`（展开祖先+选中）                                       | `file-tree-store.ts`                               | ✅ 已落地（搜索结果定位在用）                                            |
| 右栏桥 `right-tab-bridge`（openFileInRightTab，含降级）                  | `shell/file-tree/model/right-tab-bridge.wiring.ts` | ✅ 已落地（新建文件后开 tab 在用）                                       |
| 壳开合 `shellModel.toggleFileTree`                                       | `shell/model/shell-model.ts`                       | ✅ 已落地                                                                |
| daemon MCP 工具面（agent 的手，19 个工具）                               | `server/agent/mcp-server.ts`                       | ✅ 已落地                                                                |
| daemon→client 推送（session outbound 消息）                              | `session.ts` / 协议 union                          | ✅ 成熟（agent_stream / fs.search.progress 等）                          |
| client→daemon 应答（correlated requestId）                               | `daemon-client.ts`                                 | ✅ 成熟                                                                  |
| 客户端能力申报（clientCapabilities）                                     | `session.ts` hello                                 | ✅ 已有机制                                                              |
| fs 读写 RPC                                                              | 协议 `fs.*`                                        | ⚠️ 有结构写（create/rename/move/copy/delete），**缺内容读写**（C6 依赖） |

**结论：唯一缺的"新物种"是「daemon 反向控制客户端 UI」这一跳 + 缺 fs 内容读写 RPC。其余全是既有模式的组合。**

## 3. 核心架构问题与选型

AI（agent 进程）活在 **daemon 侧**，UI 活在**客户端**。AI 控 UI 必须走一条「agent → daemon → 推送 → client → 模块控制器」的反向链路。候选：

| 方案                                                 | 判定                                                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **A. daemon MCP 工具 + 协议 UI-intent 推送（推荐）** | agent 已原生持有 paseo MCP（今天就在用 create_agent 等）；复用 WS 会话与 correlated 应答；权限/寻址/后向兼容全在既有框架内解决     |
| B. skill/插件直接控制                                | ❌ skill 只是提示词，**没有传输层**——它最终还是要调某个工具。skill 的正确定位是"教 AI 何时/如何用这些工具"的**用法层**，不是控制面 |
| C. 客户端起本地 HTTP 服务                            | ❌ 新增暴露面、鉴权另起炉灶、远程/relay 场景全断                                                                                   |
| D. 文件信号/剪贴板 hack                              | ❌ 不可靠、无应答、无权限                                                                                                          |

**选 A，skill 作为 A 之上的用法说明层**（后续写一个 `paseo-ui` skill，教 agent：新建文件后调 `ui_open_file` 展示给用户）。CLI 动词（`paseo ui open <path>`）作为第二消费者随手可加（CLI 已连 daemon）。

## 4. 分层设计（自下而上）

```
┌─ L5 skill「paseo-ui」：用法说明（何时调、参数怎么填）——提示词层，无代码
├─ L4 daemon MCP 工具：ui_open_file / ui_reveal_path / ui_file_tree / ui_search_files
│      （mcp-server.ts 注册；无可控客户端时返回明确错误）
├─ L3 协议 ui.* 消息（daemon→client request / client→daemon response，requestId 关联）
│      ui.reveal.request/.response · ui.openFile.request/.response · ui.fileTree.request/.response
│      客户端 hello 申报能力旗 `uiControl`；daemon 只向申报者派发
├─ L2 壳级 UI-intent 路由（client）：一处订阅 ui.* → 分发到模块控制器；跨模块编排
│      （reveal = C1 开面板 + C2 定根定位；openFile = C5 + C2 联动）也在这层
└─ L1 模块控制器（client，纯 TS API，与 AI 无关地独立成立）：
       FileTreePublicApi：open()/close()/isOpen · showDirectory(root) · revealPath(absPath)
                          · search(query, mode) · rootPath/selectedPath（只读）
       RightPanelApi（M3）：openFile(path,{line?}) · activeFile · onActiveFileChange(cb)
```

**关键原则**：L1 是唯一碰模块内部的层——对话侧、AI 链路、快捷键未来全都只消费 L1。AI 能力 = L1 的一个远程消费者，不是特权路径。

## 5. v1 接口表（M2 落地范围）

### L1 · FileTreePublicApi（扩展现有 `file-tree-public.ts`）

```ts
interface FileTreePublicApi {
  open(): void;
  close(): void;
  readonly isOpen: boolean; // C1（代理 shellModel）
  showDirectory(rootPath: string): void; // C4（已有）
  revealPath(absPath: string, opts?: { workspaceRoot?: string | null }): void; // C2 智能定根：
  // absPath 在 workspaceRoot 内 → 根=workspaceRoot；否则 根=dirname(absPath)；再展开+选中
  search(query: string, mode: "name" | "content"): void; // C3 开搜索面板+注入
  readonly rootPath: string | null;
  readonly selectedPath: string | null;
}
```

### L3 · 协议（全部 optional 新增，双向后向兼容；能力旗 `clientCapabilities: ["uiControl"]`）

| 消息                                  | 方向          | payload（要点）                                            |
| ------------------------------------- | ------------- | ---------------------------------------------------------- |
| `ui.reveal.request`                   | daemon→client | `{ requestId, path, workspaceRoot? }`                      |
| `ui.reveal.response`                  | client→daemon | `{ requestId, ok, rootPath?, error? }`                     |
| `ui.openFile.request/.response`（M3） | 同上          | `{ requestId, path, line? }` / `{ ok, ... }`               |
| `ui.fileTree.request/.response`       | 同上          | `{ requestId, action: "open"\|"close"\|"setRoot", root? }` |
| `ui.search.request/.response`         | 同上          | `{ requestId, query, mode }`                               |

命名遵循 `docs/rpc-namespacing.md`（域 `ui`，方向后缀）；daemon 发起、client 应答与 `agent_permission_request` 同型，均有先例。

### L4 · daemon MCP 工具（注册进 `mcp-server.ts`，与既有 19 工具同模式）

| 工具              | 参数                | 行为                                                                                                  |
| ----------------- | ------------------- | ----------------------------------------------------------------------------------------------------- |
| `ui_open_file`    | `{ path, line? }`   | M2 内 = reveal；M3 起 = reveal + 右栏开 tab。**这是 AI 的主入口**（"打开这个文件"一句话对应一个工具） |
| `ui_reveal_path`  | `{ path }`          | 只定位不开 tab                                                                                        |
| `ui_file_tree`    | `{ action, root? }` | 开/关/设根                                                                                            |
| `ui_search_files` | `{ query, mode? }`  | 在 UI 里展示搜索（AI 自己找文件仍用自己的 grep——此工具是"演示给用户看"）                              |

**寻址**：v1 派发给「申报 `uiControl` 的全部在线客户端」（桌面为主；多端同开则同步动作，行为可预期）。无可控客户端 → 工具返回 `no controllable client connected`（AI 可据此告知用户"请打开桌面端"）。
**应答闭环**：daemon 等 client 的 `.response`（超时 5s）→ MCP 工具返回成功/失败给 agent，AI 拿到确定结果而非 fire-and-forget。
**权限边界**：UI intent **不授予任何新的文件系统权限**——它只指挥"展示"。真正读写仍走既有 fs.\*（有自己的 root 约束）。恶意/越权路径最多让树展示一个目录，与用户手点等价。

### C6 依赖（M3 一并动协议）：`fs.readFile.request/.response`、`fs.writeFile.request/.response`（能力旗挂既有 `fsWrite`），右栏编辑器保存 → writeFile → 目录树 `rerunActiveSearch` 钩子已就位，搜索/树即时新鲜。

## 6. 里程碑（对应目标场景逐步点亮）

| 里程碑                         | 内容                                                                                      | 点亮的场景片段                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **M1**（纯 client，1 个 PR）   | L1 API 补齐（open/close/revealPath 智能定根/search）+ L2 intent 路由骨架 + 单测           | 对话侧/内部代码可编程控树                                            |
| **M2**（协议+daemon，1 个 PR） | L3 `ui.reveal/fileTree/search` 三对消息 + `uiControl` 能力旗 + L4 四个 MCP 工具 + e2e     | **AI 说"打开文件"→ 树自动定位**（右栏 tab 用现有只读 file tab 兜底） |
| **M3**                         | `fs.readFile/writeFile` + 右栏可编辑 tab + `RightPanelApi.openFile` + `ui_open_file` 升级 | 右栏改文件→写回磁盘；搜索/树自动新鲜（钩子已备）                     |
| **M4**                         | 右栏 activeFile 变化事件 → L2 编排「切 tab 联动树根」（工作区外文件切根）                 | 多文件切换联动完整闭环                                               |
| M5（可选）                     | CLI `paseo ui ...` 动词 + `paseo-ui` skill（用法层）                                      | 非 MCP agent / 脚本也能控                                            |

## 7. 开放问题（gate-1 需拍板）

1. **多客户端寻址**：v1「广播给全部可控客户端」够不够？还是要"最近活跃的桌面端"优先？
2. **`ui_search_files` 是否 v1 就要**：AI 自己找文件不需要它；纯展示用途，可降 M5。
3. **右栏编辑器形态**（M3）：纯文本 textarea 起步，还是直接上 CodeMirror 级编辑器？影响 M3 体量。
4. **树根切换的用户打扰度**：AI 反复 reveal 会不停切根/展开——是否需要"用户手动锁根"开关？（建议 M4 观察后再定）
