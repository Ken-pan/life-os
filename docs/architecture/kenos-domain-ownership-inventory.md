---
title: Kenos 领域 Owner 与数据真源盘点
owner: kenpan
last_verified: 2026-07-18
doc_role: phase-0-domain-inventory
status: cloud-preparation-not-started
---

# Kenos 领域 Owner 与数据真源盘点

> 本文件是 Phase 0 的事实盘点工作区。它不授权 rename、迁移、双写、生产查询或删除；每个结论必须引用仓库路径、migration、schema、store 或测试证据。

## 完成口径

- 核心业务对象 100% 有且只有一个声明的长期 Owner。
- 所有现役 writer、reader、同步/离线路径和备份恢复路径已列出。
- 每个对象有 security domain、classification 和缺失元数据时的保守默认。
- 双 Owner、直接跨域写入、无 RLS、不可恢复本地真源进入 Blockers。
- 不确定项保持 `UNKNOWN`，不得用目标架构反推当前事实。

## 盘点字段

| 字段 | 填写规则 |
| --- | --- |
| Object / stable ID | 业务对象和稳定标识；不先改名 |
| Current source of truth | 当前权威表、文件、store 或外部系统 |
| Current owner | 当前负责领域；未知写 `UNKNOWN` |
| Writers | UI、RPC、MCP、脚本、trigger、automation、native client |
| Readers / projections | 所有直接读取、缓存和派生视图 |
| Offline / sync | local cache、outbox、retry、conflict、tombstone |
| Security domain | Personal / Work / Household / System / UNKNOWN |
| Classification | 目标六级分类之一或 `UNKNOWN` |
| Backup / recovery | 可验证方式；没有就明确写 `NONE FOUND` |
| Evidence | 精确 repo path、symbol、migration 或 test |
| Gap / migration candidate | 事实风险和建议的 ledger slice；不直接实施 |

## 核心对象盘点

| Object / stable ID | Current source of truth | Current owner | Writers | Readers / projections | Offline / sync | Security domain | Classification | Backup / recovery | Evidence | Gap / migration candidate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Plan task / `plan.task` | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| Plan schedule / `plan.schedule` | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| Assistant conversation | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| Assistant memory | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| Library source/document | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| Money transaction/purchase/item | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| Home project/scan/object | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| Health/Focus state | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| Training workout/readiness | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| Portal settings/today summary | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| `life_events` / outbox event | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

## External systems and connectors

| Connector / external object | External owner | Local representation | Read/write mode | Auth location | Failure/reauth behavior | Evidence | Gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

## Local-only and native paths

| Runtime / path | Unique data | Writer | Backup/export | Upgrade behavior | Evidence | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | TODO | TODO | TODO | TODO | TODO |

## Confirmed conflicts and unknowns

| ID | Finding | Evidence | Risk | Proposed owner decision or ledger slice | Status |
| --- | --- | --- | --- | --- | --- |
| INV-001 | TODO | TODO | TODO | TODO | OPEN |
