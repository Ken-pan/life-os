---
title: Agent handoff — ROI 执行暂停点
owner: kenpan
last_verified: 2026-07-17-22
doc_role: handoff
---

# Agent 交接：复利 ROI 执行（暂停）

> 给**下一个 Agent** 直接粘贴的 prompt 在文末 §Prompt。  
> Hub：[`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md) · 分线：[`../roadmap/AGENT_WORKSTREAMS.md`](../roadmap/AGENT_WORKSTREAMS.md)

## 已收割（勿重做）

| ID | 要点 | Commit / 证据 |
| --- | --- | --- |
| **PLAT.CI.0（部分）** | Home 样式 token 化；portal light accent `#2f8fc7`（≥3:1）；本地 `check:lifeos-styles` 绿；**a11y 在远程已绿** | `c8bdc905` · 远程 run `29615899245` a11y step ✅ |
| **CI concurrency** | master 按 **SHA 分并发组**，避免连推掐长 job / pending | `4931c68f` · `.github/workflows/ci.yml` |
| **AIOS.STABLE.26** | `npm test -w aios-os` **25/25**；`*.core.js` 抽出并接线 | `3648e779` |
| **HOME.MCP.13** | `home.storage_snapshots` 生产已 apply；防抖同步；`/api/mcp` `where_is`；`test:where-is` | `6ee4a26e` · migration `20260717220000` |
| **PLNR.ATTACH.0** | 生产 `planner_attachments` + bucket + Storage RLS；retry File 缓存；bug 上报失败 reject；task/project 软删级联；unit | `5dfbab0b` · migration `20260709232245` |
| **FINC（部分）** | RPC anon EXECUTE revoke；Review Needed=`matched_review` only | `8c83f85d` · finance-core `matchesPurchaseStateFilter` |
| **KNOW.VAULT.0 / USAGE.0** | Vault watcher；用量审计首报 | `8c83f85d` · [`usage-audit-2026-07.md`](./usage-audit-2026-07.md) |
| **Home RECOG（并行 Agent）** | group-merge / 露总数 / auto-refine 空转跳过 / un-merge 遥测 | `ac4d632c` · `2f444d2e` 等 |

## 卡住点（下一刀必须先做）

### PLAT.CI.0 — design-catalog **缺 snapshot 基线**（真失败，不是 cancel）

远程 run：[`29615899245`](https://github.com/Ken-pan/life-os/actions/runs/29615899245)

- 其它 job（build / integration-smoke / planner-e2e / portal / finance / music）**全绿**
- `test:design-catalog:a11y` **全绿**
- `test:design-catalog:snapshots`：**290 failed / 234 passed**
- 失败原因：`A snapshot doesn't exist … writing actual`  
  缺的是九品牌里较新的五套：`home` · `aios` · `portal` · `knowledge` · `health`  
  现有基线目录只有四生产站（planner/fitness/finance/music）约 **234** 张 PNG。

**修复路径（优先 Docker 与 CI 同镜像）：**

```bash
# 有 Docker 时（与 CI 同环境）：
npm run test:design-catalog:snapshots:canonical -- --update-snapshots

# 无 Docker 时（本机 Playwright；可能与 CI 像素有差，尽量用 scripts/design-catalog-snapshots-docker.sh）：
npm run build -w design-catalog
npm run test:design-catalog:snapshots:update
```

然后 `git add tests/visual/design-catalog.snapshots.spec.ts-snapshots/`，commit + `git push origin master`，等 **一次完整 Actions 全绿** 再关 PLAT.CI.0。

环境注意：当前 Cloud Agent VM **无 docker**；若仍无 docker，用本机 Mac 跑 canonical 脚本，或临时装 Docker 后再更新基线。

## 用户 gate / config（Agent 勿占主航道）

- **FINC.PURCHASE.6.a closure：** owner History Confirm→Undo · 双真实 JWT RLS · desktop/mobile 视觉（需 Ken 凭证）
- AIOS MCP：`https://home.kenos.space/api/mcp` + Life OS access token；Home 登录打开 `/storage` 触发快照
- Knowledge 原生 rebuild 验 Vault watcher
- `HOME.RECOG.refine` launchctl · SCHED/CAPTURE iOS · HLT-5

## 全绿后的 Next（按 ROI）

1. （可选）FINC closure 若用户给了凭证再做  
2. `HOME.RECOG.1r` 残余：区域级高精度补扫 + 质量摘要观感（group-merge 已由并行 Agent 做了，勿重复）  
3. `PLNR.UIUX.0` → `KNOW.XREF.5` → `PLAT.USAGE.0b`

## Git 政策

只在 `master` 上工作：`git pull --rebase` → commit → `git push origin master`。不要建分支 / PR / stash（见 `AGENTS.md`）。多 Agent 时只 stage 自己改的路径。

---

## Prompt（复制给下一任 Agent）

```text
你在 Ken-pan/life-os 的 master 上继续复利 ROI 执行。先读：
- docs/qa/agent-handoff-2026-07-17-roi.md（本交接）
- docs/LIFEOS_ROADMAP.md §Now
- docs/roadmap/AGENT_WORKSTREAMS.md

P0 下一刀：PLAT.CI.0 — 补齐 design-catalog visual 基线。
证据：GitHub Actions run 29615899245；snapshots 290 fail 因
home/aios/portal/knowledge/health 的 PNG 基线不存在（不是像素漂移）。
四生产站 234 张已有。用与 CI 同镜像更新：
  npm run test:design-catalog:snapshots:canonical -- --update-snapshots
（无 Docker 则按 handoff 文档降级）。提交
tests/visual/design-catalog.snapshots.spec.ts-snapshots/，
push master，确认远程 CI 全绿后关闭 PLAT.CI.0 并更新 hub/SHIPPED。

不要重做：AIOS.STABLE.26、HOME.MCP.13、PLNR.ATTACH.0、VAULT.0、USAGE.0、
FINC Review 过滤、Home group-merge（已有并行提交）。
FINC.PURCHASE.6.a 真机 closure 无 owner 凭证则跳过。
工作只在 master；中文回复用户。
```
