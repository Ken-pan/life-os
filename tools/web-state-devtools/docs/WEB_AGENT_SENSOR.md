# Web Agent Sensor — 长期架构（v1 设计）

> 目标：**任意网页**「感知 → 理解 → 操控 → 探索」可复用，**不靠站点 adapter 反复打补丁**。

参考：[Playwright MCP 无障碍快照](https://microsoft-playwright-mcp.mintlify.app/concepts/accessibility-snapshots)、[CDP DOMSnapshot + AX 双源合并（snact）](https://github.com/vericontext/snact)、[WebDriver BiDi](https://developer.chrome.com/blog/webdriver-bidi)、[Accessibility tree vs DOM（TestDino）](https://testdino.com/blog/accessibility-tree)

---

## 1. 为什么现在会「改很多次」

| 现象                          | 根因                                | 正确方向                                       |
| ----------------------------- | ----------------------------------- | ---------------------------------------------- |
| `orderTotal` 变成日期         | DOM `labelValue` 启发式，非语义字段 | **按 role/列头/AX name 抽字段**，不用 class 猜 |
| 187 变 165、合并只剩 2 条     | **export 层脱敏**污染 merge key     | raw / export **分层存储**                      |
| 每站写 `amazon-orders.js`     | 把「页面类型」当成「站点名」        | **通用 list/table/form 抽取器 + 可选 recipe**  |
| 重复按钮点错                  | 全局 selector                       | **region scoped ref**（已有 region-scoper）    |
| 列表页无 lineItems            | 数据在详情页                        | **链接跟随**是通用策略，不是 Amazon 特例       |
| extension 权限/chrome:// 报错 | 未锁定 tabId                        | **session 绑定 tab**，所有 action 带 tabId     |

**结论：** 当前是 **DOM exporter + 站点 adapter**；应升级为 **Agent Sensor（语义快照 + 状态机 + recipe）**。

---

## 2. 目标架构（三层 + 双通道）

```txt
┌──────────────── Cursor MCP ─────────────────┐
│  browser_snap / browser_act / browser_plan   │
└─────────────────────┬───────────────────────┘
                      │ stdio
┌─────────────────────▼───────────────────────┐
│  Bridge (Node)                               │
│  • command-bus (同步 WS)                       │
│  • state machine: snap→extract→diff→plan       │
│  • raw store vs export store                 │
│  • interaction graph                         │
└──────────┬──────────────────────┬───────────┘
           │ WS + HTTP             │ CDP (可选)
┌──────────▼──────────┐  ┌────────▼────────────┐
│ Extension (MV3)      │  │ CDP Sidecar         │
│ • 真实登录态 tab      │  │ chrome.debugger 或  │
│ • tab-bound actions  │  │ Playwright attach   │
│ • 轻量 snap          │  │ AX tree + DOM map   │
└─────────────────────┘  └─────────────────────┘
```

### 感知层（Perception）— 统一输出 `Snap v2`

**不要**再为每个站写 DOM 遍历；改为 **双源合并**（与 snact / chrome-devtools-mcp 同思路）：

1. **Accessibility 语义树** — role、name、expanded、disabled（[Playwright 推荐 getByRole 范式](https://testdino.com/blog/accessibility-tree)）
2. **DOM 映射** — `backendNodeId` / stable testid / scoped path（仅作执行层，不作 AI 主阅读面）
3. **Layout 提示** — scroll、viewport、重复 region（已有 `sensor.regions`）

**Snap v2 标准字段：**

```json
{
  "schema": "web-state-devtools/snap/v2",
  "page": { "url", "title" },
  "axTree": "uniform indented text with @ref=e1…",
  "refs": { "e1": { "role", "name", "backendNodeId", "scopedSelector" } },
  "regions": [],
  "entities": [],
  "explorationCandidates": []
}
```

AI **只读 axTree + entities**；执行层用 `refs[eN]` 或 scopedSelector。

### 理解层（Understanding）— 通用 entity 抽取

| 页面模式   | 检测信号                                   | 抽取方式                                |
| ---------- | ------------------------------------------ | --------------------------------------- |
| **list**   | `role=list`、重复 sibling、`region-scoper` | 每项 → actions + preview + detailUrl    |
| **table**  | `role=table/grid`、`<table>`               | **列头对齐** → `{column: value}` 行对象 |
| **form**   | `role=form`、`<form>`                      | fields 已有                             |
| **detail** | 单主 entity + breadcrumbs                  | 跟随 link 进入                          |

**Recipe（可选 YAML）** 只描述「偏离通用」的部分，而不是重写 parser：

```yaml
# recipes/amazon-orders.yaml — 仅补充，非必须
match:
  urlPattern: 'amazon.*/your-orders'
pagination:
  strategy: startIndex
  param: startIndex
  step: 10
entities:
  kind: list
  itemLink: 'a[href*="order-details"]'
  fields:
    orderDate: { from: 'label', match: 'Order placed' }
    orderTotal: { from: 'price', selector: '.a-color-price' }
follow:
  - field: detailUrl
    extract: lineItems
privacy:
  exportRedact: [shipTo, address]
  mergeKey: detailUrl # 永不脱敏 merge key
```

### 行动层（Action）— Playwright MCP 循环

行业共识（[Playwright MCP](https://microsoft-playwright-mcp.mintlify.app/concepts/accessibility-snapshots)、[Browser Agents 两种范式](https://systemdesigner.medium.com/browser-agents-with-playwright-two-paradigms-34543c7b1d4d)）：

```txt
snap₀ → plan → act(ref) → wait(settle) → snap₁ → diff → 直到 stop
```

- **ref 仅当前 snap 有效**；导航/大改 DOM 后必须 re-snap
- **auto-wait**：quiescence + network idle（CDP 侧更易做）
- **content-ready wait**：等目标 selector 数量稳定即采集（**不用** network idle / 固定 sleep）
- **tab session**：`{ tabId, url }` 绑定，禁止用 activeTab 盲操作

已有：`browser_*`、`browser_explore_deep`、interaction graph → 合并为 **`browser_session_run(recipe)`** 一个入口。

### 探索层（Exploration）— 已有 v0.5/v0.6

保留 `explorationCandidates` + `state diff` + `maxDepth`；**不再写** `amazon-harvest-2026.mjs` 这种一次性脚本。

---

## 3. 双通道分工（长期）

| 能力                   | Extension（保留）   | CDP Sidecar（新增，可选）                        |
| ---------------------- | ------------------- | ------------------------------------------------ |
| 已登录 Amazon/GitHub   | ✅ 用户真实 profile | Playwright persistent context 或 debugger attach |
| 轻量 snap + 点击填表   | ✅                  | ✅ 更强 wait                                     |
| **Accessibility tree** | ⚠️ 需 polyfill      | ✅ `Accessibility.getFullAXTree`                 |
| Network 响应 JSON      | ❌ isolated world   | ✅ CDP Network                                   |
| 虚拟列表 / lazy load   | scroll + diff       | scroll + **network 捕获 API**                    |
| 用户看到黄条           | 无                  | `chrome.debugger` 有                             |

**推荐路径：**

- **Life OS 本地页 / Netlify** → Extension 足够
- **Amazon 等登录站 + 大批量导出** → Extension 控 tab + **CDP 只读 snap**（attach 当前 tab，不另开 headless）

Extension 不必替换为 Playwright headless（会丢 cookie）；参考 [WebBridge 模式](https://github.com/kxdds/WebBridge)：**扩展 + 本地 daemon + CDP attach**。

---

## 4. 存储分层（修复脱敏/合并 bug）

```txt
bridge/data/
  raw/latest-snap.json      # 完整 orderId，供 merge / graph
  export/latest-summary.md  # AI 可读，可脱敏
  export/entities.json      # 导出用
  sessions/{id}/            # 一次 harvest 的 trace
```

规则：

- **merge key 永远来自 raw**（或 `detailUrl` 中的 id）
- **export 层**才做 `[redacted]`
- 同一 session 内 graph/diff 引用 raw id

---

## 5. MCP 工具收敛（面向 Cursor）

| 工具                    | 作用                                              |
| ----------------------- | ------------------------------------------------- |
| `browser_session_start` | 绑定 tab / 打开 URL                               |
| `browser_snap`          | AX+region entity（替代 get_web_snapshot_summary） |
| `browser_act`           | click/fill/scroll by ref                          |
| `browser_plan`          | 返回 explorationCandidates                        |
| `browser_run_recipe`    | 执行 recipe YAML（分页+follow）                   |
| `browser_export`        | raw → CSV/JSON export                             |

**Cursor 侧固定循环：**

```txt
browser_session_start → browser_run_recipe(name=generic-list-harvest) → browser_export
```

---

## 6. 实施路线图（减少「再改 N 次」）

| 阶段               | 内容                                                   | 解决什么                 |
| ------------------ | ------------------------------------------------------ | ------------------------ |
| **P0** ✅ 部分完成 | tab-bound actions、region scoper、explore_deep、WS fix | 操控稳定性               |
| **P1** ✅          | raw/export 分层 + mergeKey 规则                        | 脱敏/合并                |
| **P2** ✅          | Snap v2：AX polyfill（extension ax-snap.js）           | 任意页语义理解           |
| **P3** ✅ 部分     | 通用 table/list entity extractor                       | 去掉大部分 site adapter  |
| **P4** ✅          | Recipe YAML + `browser_run_recipe`                     | Amazon 只写 20 行 recipe |
| **P5** ✅          | CDP debugger AX + network + table-walker               | SPA/虚拟列表/API 数据    |

**Amazon 187 订单** 在 P4 后 = 一条 recipe + `browser_run_recipe`，**不是**改 adapter N 次。

---

## 7. 与「直接了解页面元素」的对应关系

| 你想知道的              | Snap v2 提供                             |
| ----------------------- | ---------------------------------------- |
| 有哪些按钮              | axTree `@ref` + role=button              |
| 点第 3 个「View order」 | regions[0].items[2].actions[open_detail] |
| 滚动后多了什么          | state diff                               |
| 进详情有什么字段        | follow link → detail entity schema       |
| 下一步干什么            | explorationCandidates                    |

**元素清单 = axTree + refs**；**操控 = ref/scopedSelector**；**数据 = entities**——三者分离，不再混在 `controls[]` + 站点 adapter 里。

---

## 8. 参考链接

- [Playwright MCP — Accessibility Snapshots](https://microsoft-playwright-mcp.mintlify.app/concepts/accessibility-snapshots)
- [Serializing Accessibility Trees for Browser Agents](https://www.vibebrowser.app/blog/serializing-accessibility-trees-for-browser-agents)
- [snact — DOMSnapshot + AX merge](https://github.com/vericontext/snact)
- [Chrome DevTools MCP — Dual-source snapshot discussion](https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/675)
- [WebDriver BiDi (Chrome Developers)](https://developer.chrome.com/blog/webdriver-bidi)
- [WebBridge — logged-in Chrome automation](https://github.com/kxdds/WebBridge)
