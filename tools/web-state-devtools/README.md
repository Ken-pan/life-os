# Web State DevTools

**Web State Capture + Local Dev Bridge + Cursor MCP**

Chrome 扩展读取当前网页结构 → localhost bridge 落地 JSON → Cursor 通过 MCP 读取或排队「打开 URL 并采集」。

> 长期架构（减少反复改 adapter）：[`docs/WEB_AGENT_SENSOR.md`](docs/WEB_AGENT_SENSOR.md)

---

## TL;DR

| 层                   | 作用                                                     |
| -------------------- | -------------------------------------------------------- |
| **Chrome Extension** | 采集 DOM / 控件 / 链接 / headings / 简化 domTree         |
| **Local Bridge**     | Express `@ 127.0.0.1:17321`，保存 `latest-snapshot.json` |
| **Cursor MCP**       | `get_latest_web_snapshot` / `open_url_for_capture`       |

---

## 目录

```txt
tools/web-state-devtools/
  extension/          # Chrome MV3（Load unpacked）
  bridge/             # Node Express + MCP server
  recipes/            # 站点 adapter 设计备忘（如 Amazon）
  README.md
```

---

## 快速开始

> **Chrome 报 `Manifest file is missing`？**
> Load unpacked 要选 **`tools/web-state-devtools/extension`** 文件夹，
> **不要**选 `web-state-devtools` 根目录。详见 [LOAD-EXTENSION-HERE.md](./LOAD-EXTENSION-HERE.md)。

### 1. 加载 Chrome 扩展（~2 分钟）

1. 打开 `chrome://extensions`
2. 开启 **Developer mode**
3. **Load unpacked** → 选择：

```txt
tools/web-state-devtools/extension    ← 必须是 extension 子目录
```

### 2. 手动采集（~30 秒）

1. 打开任意页面（如 `http://localhost:5188` Music OS dev）
2. 点击扩展图标
3. **Capture current tab**
4. **Download latest JSON** 或 **Send latest to localhost**

### 3. 启动 Bridge（~2 分钟）

```bash
cd tools/web-state-devtools/bridge
npm install
npm run bridge
```

扩展里点 **Send latest to localhost** → 写入：

```txt
tools/web-state-devtools/bridge/data/latest-snapshot.json
```

### 4. 接 Cursor MCP（~3 分钟）

在项目或全局 Cursor MCP 配置中加入（路径换成你的绝对路径）：

```json
{
  "mcpServers": {
    "web-state-devtools": {
      "command": "node",
      "args": [
        "/Users/kenpan/「Projects」/life-os/tools/web-state-devtools/bridge/mcp-server.mjs"
      ],
      "env": {
        "WEB_STATE_BRIDGE_URL": "http://127.0.0.1:17321"
      }
    }
  }
}
```

**前提**：`npm run bridge` 已在运行。

| MCP Tool                  | 用途                                           |
| ------------------------- | ---------------------------------------------- |
| `get_latest_web_snapshot` | 读取最新网页结构                               |
| `open_url_for_capture`    | 排队让扩展打开 URL 并采集（需 Dev Agent Mode） |

---

## Snapshot 字段（v0.2）

| 字段                              | 说明                                                     |
| --------------------------------- | -------------------------------------------------------- |
| `page`                            | URL、title、viewport、document size                      |
| `headings`                        | H1–H6 + `bestSelector`                                   |
| `links` / `controls` / `elements` | 带 selector 候选（data-testid > aria > role > id > css） |
| `forms`                           | form fields、label、required、bestSelector               |
| `domTree`                         | 简化语义树                                               |
| `adapter`                         | 站点插件输出（如 Amazon orders）                         |
| `derived.summaryMd`               | bridge 生成的 AI 摘要（bridge 另存 `latest-summary.md`） |
| `derived.selectors`               | 稳定 selector 索引                                       |

敏感输入值默认为 `[redacted]`。采集前等待 **500ms DOM quiescence**（SPA 友好）。

---

## MCP Tools（v0.8）

| Tool                                     | 用途                                               |
| ---------------------------------------- | -------------------------------------------------- |
| **`browser_capture_enhanced`**           | CDP 增强采集：真 AX tree + table 行 + network JSON |
| **`browser_network`**                    | start / stop / get / wait_idle 网络捕获            |
| **`browser_snap`**                       | 默认 enhanced capture → axTree + refs              |
| **`browser_run_recipe`**                 | YAML recipe（内部 enhanced capture）               |
| **`browser_act`** / **`browser_export`** | ref 操控 / 导出                                    |

> CDP 采集时 Chrome 会短暂显示**调试黄条**；完成后 `browser_network(action=stop)` 或 recipe 结束可保持 attach 以便连续分页。

Amazon：`browser_run_recipe(recipeId=amazon-orders)` 或 `WEB_STATE_ALLOW_AMAZON=1 node scripts/run-recipe.mjs amazon-orders`

### v0.7 能力

Snap v2、recipe 引擎、raw/export 分层、entity extractor

### v0.6 能力

Region scoper、page model、state diff、interaction graph

### v0.4 能力

WebSocket agent、同步 browser 控制

---

Icons：`extension/icons/generate-icons.py` 生成，**勿复制**其他 Life OS 扩展图标。

## 自动化验证

```bash
npm run verify:web-state   # monorepo 根目录
```

```bash
# Terminal 1
cd tools/web-state-devtools/bridge && npm run bridge

# Terminal 2（可选）
cd apps/music && npm run dev
```

1. Chrome → Music OS 本地页
2. 扩展 → 开启 **Dev Agent Mode** → **Capture & Send**（或让 Cursor 调用 `browser_navigate` + `capture`）
3. Cursor：`get_web_snapshot_summary` 或 `get_latest_web_snapshot`（默认 summary）

Bridge 产物：

```txt
bridge/data/latest-snapshot.json
bridge/data/latest-summary.md
bridge/data/latest-selectors.json
```

---

## 站点 Adapter

| Adapter          | 文件                                  | 触发 URL          |
| ---------------- | ------------------------------------- | ----------------- |
| Amazon orders v0 | `extension/adapters/amazon-orders.js` | `amazon.*/order*` |

详见 [`recipes/amazon-orders.md`](recipes/amazon-orders.md)。

新增 adapter：在 `extension/adapters/` 注册 `window.__WSD_ADAPTERS__` 并在 `service_worker.js` 注入列表中加入。

---

## 后续迭代

| 优先级 | 内容                                        |
| ------ | ------------------------------------------- |
| P0     | ✅ summary.md、selectors、forms、quiescence |
| P1     | ✅ Amazon adapter v0；更多 adapter          |
| P2     | 点击后再 capture、Shadow DOM 深穿透         |
| P3     | 敏感站点白名单                              |

---

## 与 Finance OS Sync 扩展的区别

|      | Finance OS Sync                | Web State DevTools              |
| ---- | ------------------------------ | ------------------------------- |
| 目的 | 抓取券商/记账数据写入 Supabase | **开发辅助**：页面结构 → Cursor |
| 通讯 | postMessage ↔ Finance OS 页面  | localhost HTTP + MCP            |
| 权限 | 特定金融站点 + localhost       | `activeTab` + bridge host       |

两者独立，可共享 quiescence / MV3 模式经验。
