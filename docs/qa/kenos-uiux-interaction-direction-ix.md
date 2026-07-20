# Interaction Direction Review — Round IX

**Date:** 2026-07-20  
**Evidence before:** `rounds/r2/after/web-390x844/`  
**Evidence after:** `rounds/ix-interaction/after/` + `contact/ix-*.png`  
**Tests:** aios `133` pass  
**Preview:** `http://127.0.0.1:5291/?kenosDemo=1`

## Problems (cited)

1. **Continue 浮层盖住 Work 行**（r2 today.png）— 与主内容抢触达。  
2. **Continue 与 Spaces Tab 同用 globe** — 语义撞车。  
3. **Switcher 以 SYSTEM 四项开头** — 与底栏重复；空 Recent 时变成第二份目录。  
4. **AppBar “Spaces” vs Sheet “Continue”** — 同一动作两套名字。  
5. **无 Recent 时 Continue 无故事** — demo 未播种。

## Direction locked

| 入口 | 职责 |
|---|---|
| **Spaces Tab** | 领域目录 |
| **Continue**（header / AppBar / Sidebar · history） | 续接 Recent |
| **Switcher** | Recent → Pinned → All(可搜/可折叠) → System(仅 Today) |

## Shipped

- 删除底栏上方固定 Continue pill  
- Today / Spaces header + AppBar + Sidebar：`history` + Continue  
- Switcher 段序与瘦身 System；Recent 带 resume 副文案  
- Demo seed：Training mid-set / Work / Plan  
- 流程验证：Continue → Training → `/spaces/training`

## Why after is better

- Today 底部不再被 pill 挡住 Work  
- Spaces vs Continue 图标/位置分离  
- 打开 Switcher 先看到 Recent（含 `Push Day · mid-set`），而不是再抄一遍 Tab  

## Still weak

- External Plan 仍 `window.open`（plain deep link）  
- Inbox 等无自定义头的页 Continue 入口较弱  
- Work hub 副文案与标题重复（demo seed 可再精炼）  

**Not:** visual PASS / production deploy.
