# Cursor Page Bridge / Web State DevTools

> **状态**：MVP 已落地 → [`web-state-devtools/`](../../../web-state-devtools/)
> **更新**：2026-07-06

---

## TL;DR

不是爬虫，而是 **Web State Capture + Local Dev Bridge + Cursor MCP**：

```
Chrome Extension  →  localhost bridge (17321)  →  Cursor MCP
     采集 DOM              保存 JSON                 读取 / 排队打开 URL
```

---

## 推荐架构（MVP 采用）

| 层               | 作用                                  | 实现                                   |
| ---------------- | ------------------------------------- | -------------------------------------- |
| Chrome Extension | 读取页面 DOM / 控件 / 链接 / viewport | MV3 + `activeTab` + `chrome.scripting` |
| Local Bridge     | 接收 snapshot，提供 `/latest` API     | Node + Express，`127.0.0.1:17321`      |
| Cursor MCP       | 读最新状态或排队采集                  | stdio MCP → fetch localhost            |

### 为何 HTTP Bridge 而非 WebSocket（MVP）

| 方案                    | 优点                               | 缺点                         |
| ----------------------- | ---------------------------------- | ---------------------------- |
| **HTTP Bridge（当前）** | 简单、可 curl 调试、扩展只需 fetch | 双向需轮询（Dev Agent Mode） |
| WebSocket Relay         | 实时双向                           | 多一层连接管理、SW 保活      |
| Native Messaging        | 官方本地进程通道                   | 安装/注册成本高              |

Phase 2+ 若需要高频交互（点击后再抓），可再加 WebSocket；MVP 优先跑通 **采集 → JSON → Cursor**。

---

## 代码位置

```txt
web-state-devtools/
  extension/     manifest, popup, service_worker, content.js
  bridge/        server.mjs, mcp-server.mjs
  recipes/       amazon-orders.md（adapter 设计，未实现）
  README.md      安装与运行
```

---

## Snapshot Schema（v1）

Schema id: `web-state-devtools/snapshot/v1`

| 字段          | 说明                                       |
| ------------- | ------------------------------------------ |
| `page`        | url, title, origin, viewport, documentSize |
| `meta`        | meta tags                                  |
| `headings`    | H1–H6 + selector                           |
| `links`       | href, text, rect                           |
| `controls`    | inputs/buttons/roles，敏感值 `[redacted]`  |
| `elements`    | 可见语义元素                               |
| `domTree`     | 简化树（深度上限 6）                       |
| `storageKeys` | local/session storage **keys only**        |

---

## Cursor MCP Tools（v0.2）

| Tool                       | 说明                                |
| -------------------------- | ----------------------------------- |
| `get_web_snapshot_summary` | **推荐** — markdown 摘要            |
| `get_latest_web_snapshot`  | `format=summary \| json \| compact` |
| `get_web_selectors`        | 稳定 selector 列表                  |
| `open_url_for_capture`     | 入队 → Dev Agent Mode               |

配置示例见 [`web-state-devtools/README.md`](../../../web-state-devtools/README.md)。

P0 已完成：summary.md、selectors、forms、quiescence、Amazon adapter v0。

---

## 与 Cursor 内置 Browser MCP

|        | 内置 Browser MCP | Web State DevTools   |
| ------ | ---------------- | -------------------- |
| 浏览器 | Cursor 内嵌      | **用户 Chrome**      |
| 登录态 | 通常无           | **有**               |
| 集成   | Cursor 自带      | 项目 MCP + localhost |

---

## 站点 Adapter（P1）

Generic snapshot 与站点逻辑分离。Amazon 订单见 [`recipes/amazon-orders.md`](../../../web-state-devtools/recipes/amazon-orders.md)：

- 优先 Amazon 官方 Request Your Data
- Adapter 只读可见 DOM，不 bypass 登录/风控

---

## 后续迭代（摘自 MVP 规划）

### P0 — AI 可读格式

- `summary.md` 自动生成
- `selectors.json`（data-testid > aria > role > CSS path）
- `forms.json`

### P1 — Adapter 系统

```txt
adapters/generic.js
adapters/amazon-orders.js
```

### P2 — Command loop

点击 / 填表 / 滚动后再 capture

### P3 — 安全

敏感站点白名单、Dev Agent Mode 硬开关、大数据仅本地文件

---

## 更长远的 PageSnapshot v1（可选演进）

早期构思中的 Compact tuple 格式、SOM 兼容导出、Svelte component hints 等仍可作为 P0+ 增强，见 git 历史中本文件 2026-07-06 初版。当前 MVP 先用 structured JSON 验证 Cursor 工作流。

---

## 参考

- [Chrome MV3 messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Cursor MCP docs](https://cursor.com/docs/mcp)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- 本仓库 [`apps/finance/extension/README.md`](../../apps/finance/extension/README.md) — MV3 + quiescence 模式
