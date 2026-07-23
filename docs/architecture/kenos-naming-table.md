---
title: Kenos 命名冻结表
owner: kenpan
last_verified: 2026-07-22
doc_role: naming-freeze-register
status: frozen-v1
---

# Kenos 命名冻结表

> 本表是 KENOS-001「产品品牌为 Kenos,内部领域 ID 与用户文案分离」的实施前置(冻结 ID 表),也是 Migration Ledger 中「Life OS 品牌」与各 `* → Money/Training/Library/Plan/Health` rename slice 的共同前置。冻结依据:Owner 于 2026-07-22 明确指示按「Kenos + 领域名」重命名现有项目(例:FinanceOS → Kenos Money)。

## 1. 冻结规则

1. **只改用户可见文案与域名,不改内部 ID。** 目录名(`apps/finance`)、package 名(`@life-os/*`)、Supabase schema/表、路由前缀、localStorage key、事件 `source` 均保持现状,由各自 rename slice 在满足自身 gate 后另行迁移。
2. 用户可见全名格式为 `Kenos <Domain>`;短名(PWA short_name、导航、窄屏)为 `<Domain>`。例外:AIOS 品牌为 **Korben**(独立名,不带 Kenos 前缀,Owner 2026-07-22 指定)。
3. 旧名称(FinanceOS、KnowledgeOS 等)自冻结日起为 legacy 文案,新代码/新文档不得再引入;存量文档不回溯批改。
4. 域名于 2026-07-22 一并冻结(下表「新域名」列):仓库侧引用已切换;GoDaddy DNS、Netlify custom domain、Supabase auth 允许列表与 `app_registry` 表由 Owner 按 cutover 清单执行;旧子域保留 301 过渡,退役期在 Portal/redirect slice 中另定。

## 2. 命名对照表(v1,2026-07-22 冻结)

| 内部领域 ID | 仓库位置 | 旧用户可见名 | 新用户可见全名 | 短名 | 旧域名 | 新域名 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `plan` | `apps/planner` | Planner | Kenos Plan | Plan | planner.kenos.space | **plan.kenos.space** | |
| `money` | `apps/finance` | FinanceOS | Kenos Money | Money | finance.kenos.space | **money.kenos.space** | |
| `library` | `apps/knowledge` | KnowledgeOS | Kenos Library | Library | knowledge.kenos.space | **library.kenos.space** | Vault 仍是正文唯一 writer |
| `training` | `apps/fitness` | FitnessOS | Kenos Training | Training | fitness.kenos.space | **training.kenos.space** | |
| `health` | `apps/health` | HealthOS | Kenos Health | Health | health.kenos.space | (不变) | OPEN-001 已按领域 ID `health` 处理;Status 只是读模型 |
| `home` | `apps/home` | HomeOS | Kenos Home | Home | home.kenos.space | (不变) | |
| `music` | `apps/music` | MusicOS | Kenos Music | Music | music.kenos.space | (不变) | |
| `assistant` | `apps/aios` | AIOS | **Korben** | Korben | www.kenos.space | (不变,即 www) | Owner 指定独立品牌名;wordmark 无高亮段 |
| `work` | AIOS `/work` surface | — | Kenos Work | Work | — | — | 无独立 app,只作 surface 文案 |
| `portal` | `apps/portal` | Life OS / Portal | (不改名) | — | portal.kenos.space | (不变) | 待退役迁移源,不投入改名;退役 gate 见 Ledger |
| `paper` | `clients/paper`(PaperOS) | PaperOS | Kenos Paper | Paper | — | — | 设备客户端,非领域 Owner |
| — | `clients/apple` | Kenos | Kenos | Kenos | — | — | 统一 Apple 客户端,已是目标名 |

## 3. 域名 cutover 清单(Owner 手动步骤,2026-07-22 待执行)

仓库侧引用(manifests/registry、AIOS 深链与 MCP 预设、Portal 启动器、Apple KenosDomainRegistry/DailyBetaConfig/OriginResolver、finance 扩展、auth 配置)已全部切到新域名。Owner 决定**旧域名直接退役,不做 301 过渡**(2026-07-22):

1. ✅ **Netlify**(2026-07-22 已由 CLI 执行):四站改名并只挂新主域,旧 alias 已删——`kenos-plan` / `kenos-money` / `kenos-library` / `kenos-training`.netlify.app,主域分别为 plan/money/library/training.kenos.space。旧 `*os-ken` 子域与旧 kenos.space 子域自此失效。
2. **GoDaddy DNS**(待 Owner):四个新子域 CNAME → 对应 `kenos-*.netlify.app`;旧 planner/finance/knowledge/fitness 记录可删。
3. **Supabase auth**:Dashboard → Auth → URL Configuration 对齐 `config.toml` 现状(只含新域;`verify-life-os-identity-p0.sh` 按新名单断言)。
4. **`app_registry` 生产表**(不改 migration 文件,直接跑一次幂等 update):
   ```sql
   update public.app_registry set display_name='Kenos Plan',    app_url='https://plan.kenos.space'     where app_key='planner';
   update public.app_registry set display_name='Kenos Training',app_url='https://training.kenos.space' where app_key='fitness';
   update public.app_registry set display_name='Kenos Money',   app_url='https://money.kenos.space'    where app_key='finance';
   update public.app_registry set display_name='Kenos Music'    where app_key='music';
   update public.app_registry set display_name='Kenos Home'     where app_key='home';
   update public.app_registry set display_name='Kenos Paper'    where app_key='paper';
   ```
5. ⚠️ **无 301 的后果已知悉**:旧域名书签/已装 PWA/外部引用直接失联;origin 级 localStorage/IndexedDB 不迁移(planner/finance/fitness 真源在云端、knowledge 真源在原生 Vault,可接受);`.kenos.space` 父域 SSO cookie 在新子域自动生效。
6. **浏览器扩展**:finance 扩展需在 Chrome 重新加载以获得 `money.kenos.space` host 权限。

## 4. 不在本次范围

- 目录/包/schema/路由 mass rename(暂不执行清单明令禁止)。
- Tauri `.app` 包名(AIOS.app/HealthOS.app/KnowledgeOS.app,被 FocusAgent 与 build 脚本引用,随 Phase 4 壳退役处理)。
- App Store / 发行元数据(Phase 4 distribution gate 后)。
