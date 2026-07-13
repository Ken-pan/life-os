# App Generator 主线（PLAT.GEN.*）

PLAT.SHELL.1–6 之后的 generator 深化路线。Hub 状态见
[`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)；前置：[`PLATFORM.md`](./PLATFORM.md) §PLAT.SHELL。

**现状（2026-07-12）：** `create-life-os-app.mjs` 生成 app + AppManifest；
`promote-life-os-app.mjs` 按 manifest 幂等接线 16 个注册点。剩余手动：Netlify
site/DNS、图标、品牌配色、auth 接入、模板演进不回灌旧 app。

**业界对标（2026-07 调研）：** Nx sync generators 的 `sync:check` CI 漂移守卫；
Copier/Cruft 的模板版本戳 + `update` 三方合并回灌；Backstage golden path 的
day-2 操作自动化（比 day-1 生成影响更大）；spec-driven 的 manifest 反转为
single source of truth。来源见文末。

---

## 排序原则

单人仓库,ROI 优先:先守护已有投资(GEN.1 防漂移),再消灭最大剩余手工
(GEN.2 部署 / GEN.5 auth),结构性反转(GEN.4)在守卫到位后做,模板回灌
(GEN.3)按痛感触发。**不引入 Nx / Backstage / Copier 本体** — 工具运维成本
超过 6-app 仓库的收益,只借用它们的模式。

---

## Tickets

| Ticket         | 内容                                                                 | 模式来源           | 状态 |
| -------------- | -------------------------------------------------------------------- | ------------------ | ---- |
| **PLAT.GEN.1** | Manifest schema 校验 + `promote --check` 漂移守卫接 CI               | Nx `sync:check`    | ✅ 2026-07-12 |
| **PLAT.GEN.2** | Day-2 部署自动化:Netlify site 创建/env/DNS 清单 + 图标生成参数化    | Backstage day-2    | ⬜   |
| **PLAT.GEN.3** | 模板版本戳 + `update-life-os-app`(starter 演进回灌旧 app)           | Copier/Cruft       | ⬜   |
| **PLAT.GEN.4** | 注册表反转:六 app 注册信息迁入各自 manifest,注册表变生成物         | spec-driven SSOT   | ⬜   |
| **PLAT.GEN.5** | Day-2 能力模块:`add-capability` auth/supabase/portal-card 可组合接入 | Backstage golden path | ⬜ |

### PLAT.GEN.1 — 校验与漂移守卫 ✅ 2026-07-12

已发货(`81a6dcba`):
- `scripts/lib/app-manifest.mjs`:字段级校验(create/promote 共用,含
  shellType/hex/端口/routes 等约束),报错定位到字段。
- `promote-life-os-app.mjs` 重写为 **sync 语义**:接线点从 insert-once 升级
  为 upsert — 改 manifest(端口/文案/production…)后重跑即同步注册表;
  `--check` dry-run 重算 16 个接线点,drift/missing 非零退出;`--check --all`
  扫描全部带 manifest 的 app。文件类产物(brands json/netlify.toml/spec)
  只创建从不覆盖。
- manifest 新增 `production`/`pwaTestEnabled`/`moreButton`/`moreClose`/
  `authGate`,PWA 矩阵条目完全可派生。
- `npm run check:app-manifests` 接入 CI `integration-smoke`。
- 验证:demo app 篡改端口+文案+production → check 精准报 5 个漂移点 exit 1
  → promote 再同步(5 更新/11 未变)→ check 绿;坏 hex 与端口撞 planner
  均被拦;新端口全链路(preview/playwright 3/3)可用。

### PLAT.GEN.2 — 部署 day-2 自动化（~1d）

- `promote --netlify`(或独立 `scripts/netlify-provision.mjs <id>`):
  `netlify sites:create` + Deploy Key 关联 monorepo + 4 个 Supabase env +
  `deploy-all-netlify.sh` 追加 `deploy_one`(site id 自动写入)+
  `docs/ops/netlify.md` 六站表加行(codemod,同 promote 锚点模式)。
- DNS(GoDaddy CNAME)保持手动但打印精确指令;验证 `curl` 探活。
- `generate-life-os-brand-icons.py` 参数化:`--app <id>` 从 manifest 读
  wordmarkAccent 生成中性 favicon-32/apple-touch-icon/brand-circle-* 四件套
  → `apps/<id>/static/`,starter webmanifest `icons` 数组随之填充。
- 价值:晋升清单的"剩余手动步骤"从 5 条缩到 1 条(DNS)。

### PLAT.GEN.3 — 模板版本化与回灌（~1d,按痛感触发）

- create 时把 starter 的当前 git commit 写入 manifest(`templateVersion`)。
- `scripts/update-life-os-app.mjs <id>`:diff starter@记录版本 → starter@HEAD,
  对 app 内同源文件做三方合并(冲突落 `.rej` 风格标记),结尾更新版本戳。
- 现实定位:6 个存量 app 大量业务化,**不追求全自动合并**;首版只做
  drift 报告(哪些 app 落后 starter 几个 commit、哪些文件可安全同步),
  shell/PWA 基座类文件(app.html、service worker、spec)优先。
- 触发条件:starter 发生第二次跨 app 需要的修复时再做(YAGNI 守卫)。

### PLAT.GEN.4 — 注册表反转,manifest 成为 SSOT（~1.5d,GEN.1 之后）

- 现状方向是 manifest --codemod--> 手写注册表;反转为:
  `scripts/build-app-registry.mjs` 扫 `apps/*/app.manifest.json` 生成
  `packages/theme/src/generated/appRegistry.js`,`siteMeta.js` / `launcher.js` /
  brand accent / `apps.config.mjs` 改为薄壳 re-export(同 design-tokens
  `build:tokens` → `generated/` 的既有模式)。
- 迁移:六个存量 app 补 `app.manifest.json`(从注册表反抽,一次性脚本),
  验证生成物与现注册表逐字节一致后切换。
- promote 从"16 处插入"退化为"放一个 manifest + build",锚点注释全部退役;
  GEN.1 的漂移守卫变成 `build && git diff --exit-code`(staleness guard,
  与 validate-tokens 第 6 条同款)。
- 风险:`LifeOsAppId` typedef 由 union 变生成物,注意 jsconfig 消费端;
  Finance(direct storageKind)等特例字段要全量建模进 schema。

### PLAT.GEN.5 — 能力模块 add-capability（~1d/项,按需）

- `scripts/add-capability.mjs <id> <cap>`,可组合、幂等,同 promote 锚点模式:
  - `auth`:`createLifeOsAuth` + Supabase 接线(照 fitness
    `src/lib/auth.svelte.js` 派生),`.env.example`、登录路由、settings 卡。
  - `supabase-table`:表 + RLS migration 骨架(走 `supabase-sql.sh` 流程)。
  - `portal-card`:Portal 摘要卡注册(晋升清单最后一条手动项)。
  - `production`:上线开关(apps.config `production: true` + PWA 矩阵
    `pwaTestEnabled` 复核 + hub 六站表提醒)。
- 价值:starter 保持薄(不预置 auth,避免每个 app 删代码),能力按需长出;
  Backstage 经验:day 2–50 的引导式操作比 day-1 生成影响更大。

---

## Not doing（明确不做）

- **不引入 Nx / Turborepo gen / Backstage / Copier 工具本体** — 6 app 单人
  monorepo,自研 ~300 行脚本已覆盖其核心模式,新增工具的学习/升级/锁定
  成本无法摊销。
- **starter 不预置 auth / Supabase** — 保持"删无可删"的最小基座,能力走 GEN.5。
- **Finance React 栈不进模板体系** — 与 hub §Next ✗ 的 ROI 评审一致,仅
  Svelte 栈走 generator。

## 调研来源

- Nx sync generators / `sync:check` CI 漂移守卫:
  [nx.dev/docs/concepts/sync-generators](https://nx.dev/docs/concepts/sync-generators)
- Copier update 三方合并、Cruft 模板版本戳:
  [copier.readthedocs.io/en/stable/updating](https://copier.readthedocs.io/en/stable/updating/) ·
  [cruft.github.io/cruft](https://cruft.github.io/cruft/) ·
  [Cruft vs Copier(Blenddata)](https://www.blenddata.nl/en/blogs/cruft-vs-copier-automating-template-updates-at-scale)
- Backstage golden path 与 day-2 操作优先级:
  [platformengineering.org — golden paths that go somewhere](https://platformengineering.org/blog/how-to-pave-golden-paths-that-actually-go-somewhere) ·
  [Roadie — Day 0 to Day 2 guide](https://roadie.io/blog/from-day-0-to-day-2-a-guide-to-planning-and-implementing-backstage/)
- Manifest/spec 作为 single source of truth:
  [BCMS — Spec-Driven Development 2026](https://thebcms.com/blog/spec-driven-development)
- Turborepo vs Nx 生成器取舍(何时值得上重工具):
  [PkgPulse — Turborepo vs Nx 2026](https://www.pkgpulse.com/guides/turborepo-vs-nx-monorepo-2026)
