---
title: Kenos Phase 0 安全、分类与动作风险矩阵
owner: kenpan
last_verified: 2026-07-18
doc_role: phase-0-policy-matrices
status: cloud-preparation-not-started
---

# Kenos Phase 0 安全、分类与动作风险矩阵

> 本文件把目标政策变成 owner 可签署的矩阵。Cloud 任务可以用仓库事实填写建议和缺口，但不能代替 owner 批准 Work、restricted-local-only、R3/R4、数据保留或永久授权规则。

## Security domains

| Domain | Allowed storage | Allowed processing | Default sharing | Cross-domain rule | Unknown-value fallback | Status/evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Personal | TODO | TODO | TODO | TODO | deny/categorize more strictly | DRAFT |
| Work | TODO | TODO | TODO | TODO | deny cloud copy/model use | DRAFT |
| Household | TODO | TODO | TODO | TODO | single-user only until approved | DRAFT |
| System | TODO | TODO | TODO | TODO | no implicit domain bypass | DRAFT |

## Data classification

| Classification | Storage | Cloud model | Local model | Search/index | Retention/export | Unknown-value fallback | Status/evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| public | TODO | TODO | TODO | TODO | TODO | n/a | DRAFT |
| personal | TODO | TODO | TODO | TODO | TODO | sensitive | DRAFT |
| sensitive | TODO | TODO | TODO | TODO | TODO | restricted_local_only | DRAFT |
| work_confidential | TODO | TODO | TODO | TODO | TODO | no personal cloud/model | DRAFT |
| restricted_local_only | local only | deny | TODO | local only | TODO | deny | DRAFT |
| ephemeral | TODO | TODO | TODO | no durable index by default | TODO | shortest safe retention | DRAFT |

## Action risk and approval

| Risk | Meaning | Default decision | Preview/approval | Audit/activity | Undo/compensation | Permanent grant | Existing capability evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R0 | read-only/local observation | TODO | TODO | TODO | n/a | TODO | TODO |
| R1 | low-impact reversible write | TODO | TODO | TODO | required | TODO | TODO |
| R2 | meaningful but bounded reversible action | TODO | preview or Undo | required | required | TODO | TODO |
| R3 | external, sensitive or high-impact action | deny without explicit confirmation | required | 100% | required where possible | deny by default | TODO |
| R4 | destructive/irreversible/system-critical action | unsupported in Phase 0/1 | owner/operator gate | 100% | explicit recovery plan | never | TODO |

## Owner sign-off queue

| Decision | Recommended default | Evidence | Consequence if deferred | Owner status |
| --- | --- | --- | --- | --- |
| OPEN-001 Health/Status/Focus | See decision register | TODO | Naming/owner drift | PENDING |
| OPEN-002 Work cloud/model policy | Default deny | TODO | No Work mirroring/embedding | PENDING |
| OPEN-003 Household multi-user | Define domain only | TODO | No multi-account UI | PENDING |
| OPEN-004 Goal/Value owner | Core Goals referenced by Plan | TODO | Coordination contract remains draft | PENDING |
| OPEN-005 Mac Runtime | Threat-modelled spike first | TODO | No runtime implementation | PENDING |
| OPEN-006 Apple repo path | `clients/apple` | TODO | No Xcode workspace creation | PENDING |
| OPEN-007 attention budget | 3/day initial default | TODO | Digest/contextual only | PENDING |
| OPEN-008 Portal retention | 2 stable releases + 30 days no writes | TODO | No retirement date | PENDING |
