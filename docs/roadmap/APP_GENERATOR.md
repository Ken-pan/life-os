# App Generator 主线（PLAT.GEN.*）

PLAT.SHELL.1–6 之后的 generator 深化路线。Hub 状态见
[`../LIFEOS_ROADMAP.md`](../LIFEOS_ROADMAP.md)；前置：[`PLATFORM.md`](./PLATFORM.md) §PLAT.SHELL。

**现状（2026-07-17）：** `create-life-os-app.mjs` 生成 app + AppManifest；
`promote-life-os-app.mjs` 按 manifest 幂等接线 11 个注册点（GEN.4 后注册表六步
收敛为一次 build）；`add-capability.mjs` 接 day-2 能力（auth / supabase-table /
portal-card / mcp-server，GEN.5+6）。**剩余手动：** DNS、品牌配色、Portal 卡的
RPC+渲染、`/api/mcp` 重定向、登录 UI、模板演进不回灌旧 app（GEN.3）。
当前 manifest 真源含九个产品 app；`starter` 仅作模板不进注册表。**漂移记录：**
2026-07-17 发现生成的 `appRegistry.js` 落后 manifest 导致 `check:app-manifests` 红，
已运行 `npm run build:app-registry` 重生成（1 行 diff）并复验 `--check` 绿（9 app）。

**业界对标（2026-07 调研）：** Nx sync generators 的 `sync:check` CI 漂移守卫；
Copier/Cruft 的模板版本戳 + `update` 三方合并回灌；Backstage golden path 的
day-2 操作自动化（比 day-1 生成影响更大）；spec-driven 的 manifest 反转为
single source of truth。来源见文末。

---

## 排序原则

单人仓库,ROI 优先:先守护已有投资(GEN.1 防漂移),再消灭最大剩余手工
(GEN.2 部署 / GEN.5 auth),结构性反转(GEN.4)在守卫到位后做,模板回灌
(GEN.3)按痛感触发。**不引入 Nx / Backstage / Copier 本体** — 工具运维成本
超过单人九-app 仓库的收益,只借用它们的模式。

---

## Tickets

| Ticket         | 内容                                                                 | 模式来源           | 状态 |
| -------------- | -------------------------------------------------------------------- | ------------------ | ---- |
| **PLAT.GEN.1** | Manifest schema 校验 + `promote --check` 漂移守卫接 CI               | Nx `sync:check`    | ✅ 2026-07-12 |
| **PLAT.GEN.2** | Day-2 部署自动化:Netlify site 创建/env/DNS 清单 + 图标生成参数化    | Backstage day-2    | ✅ 2026-07-12 |
| **PLAT.GEN.3** | 模板版本戳 + `update-life-os-app`(starter 演进回灌旧 app)           | Copier/Cruft       | ⬜   |
| **PLAT.GEN.4** | 注册表反转：当时六 app 注册信息迁入 manifest，现已扩到九 app；注册表为生成物 | spec-driven SSOT | ✅ 2026-07-12 |
| **PLAT.GEN.5** | Day-2 能力模块:`add-capability` auth/supabase-table/portal-card 可组合接入 | Backstage golden path | ✅ 2026-07-14 |
| **PLAT.GEN.6** | `mcp-server` 能力 + `@life-os/mcp-server`:新 app 从 day-1 被 AIOS 发现 | MCP / 编排层 | ✅ 2026-07-14 |

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

### PLAT.GEN.2 — 部署 day-2 自动化 ✅ 2026-07-12

已发货:
- `scripts/netlify-provision.mjs <id>`:**dry-run 默认**,`--apply` 才创建
  资源 — `sites:create`(`<id>os-ken`)+ `env:clone --force`(从 fitness 站
  复制 4 个 Supabase 变量)+ `deploy-all-netlify.sh` 追加 `deploy_one`
  (真实 site id)+ `docs/ops/netlify.md` 表加行;幂等预检(已接线拒绝
  重复供给);DNS 与 Git 构建接线打印精确指令。CLI 部署路径不依赖 Git 接线。
- `generate-life-os-brand-icons.py` 参数化:`--app <id>` 单 app 重建
  (对 home 验证字节级一致);`--bootstrap <id>` 从 manifest 生成中性
  占位 master(themeColor 底 + wordmarkAccent 首字母 monogram,字形落在
  64% 圆裁剪安全区)→ 走既有派生管线出全套 19 文件 → 注入 webmanifest
  (icons 数组 + PWA 必需字段),幂等。
- create/promote 结尾清单改为指向两个 day-2 命令;剩余手动仅 DNS
  (+可选 Git 自动构建)。
- 验证:demo app bootstrap 实测(图标目检 + webmanifest 校验 + 重跑幂等)、
  provision dry-run + codemod 在副本上验证、netlify CLI v26 flags 核对。

### PLAT.GEN.3 — 模板版本化与回灌（~1d,按痛感触发）

- create 时把 starter 的当前 git commit 写入 manifest(`templateVersion`)。
- `scripts/update-life-os-app.mjs <id>`:diff starter@记录版本 → starter@HEAD,
  对 app 内同源文件做三方合并(冲突落 `.rej` 风格标记),结尾更新版本戳。
- 现实定位:6 个存量 app 大量业务化,**不追求全自动合并**;首版只做
  drift 报告(哪些 app 落后 starter 几个 commit、哪些文件可安全同步),
  shell/PWA 基座类文件(app.html、service worker、spec)优先。
- 触发条件:starter 发生第二次跨 app 需要的修复时再做(YAGNI 守卫)。

### PLAT.GEN.4 — 注册表反转,manifest 成为 SSOT ✅ 2026-07-12

已发货:
- `scripts/build-app-registry.mjs` 扫 `apps/*/app.manifest.json`(starter 除外)
  生成 `packages/theme/src/generated/appRegistry.js`(siteMeta / origins /
  switcher / wordmark accent+base+assetPrefix / PWA 原始矩阵 + `LifeOsAppId`
  typedef);`--check` 为 staleness 守卫,即 `npm run check:app-manifests`
  新实现(CI 不变)。
- `siteMeta.js` / `launcher.js` / `brand.js` / `scripts/pwa/apps.config.mjs`
  改为薄壳:只保留行为函数,数据 re-export 生成物;apps.config 按 shellType
  计算 scroll selector 并手工保留 starter 调试条目。
- 六个存量 app 反抽出 `app.manifest.json`;特例全部建模进 schema:
  Finance(direct storageKind / brandAssetPrefix / wordmarkBase / favicon 路径 /
  authGate / mainQuery)、fitness·music(devPort≠previewPort)、portal
  (无 switcherOrder = 不进切换器)、pwaName 大小写、switcherOrder 显式排序。
- **等价性门槛:** 反转前后对全部导出(siteMeta/origins/switcher/brand getter
  视图/PWA_APPS)做键序不敏感深比较 — **零差异**后才切换。
- promote 从 16 接线点缩到 11(注册表六步收敛为一次 build);全仓 typecheck
  7/7 零错误;demo E2E(晋升→篡改→双守卫报漂移→再同步→playwright 3/3)。
- 存量 app 的 launch.json 端口(5871–5875 段)是刻意与 e2e 隔离的历史约定,
  不由 manifest 驱动 — promote 写模式只面向新 app。

### PLAT.GEN.5 — 能力模块 add-capability ✅ 2026-07-14

已发货 —— `scripts/add-capability.mjs <id> <cap> [extra] [--check]`(`npm run add:capability`),
幂等 + `--check` 漂移守卫,与 promote 同构(文件类产物只创建从不覆盖):

| cap | 接线点 | 备注 |
| --- | --- | --- |
| `auth` | `src/lib/supabase.js`(`createLifeOsSupabaseClient`)· `src/lib/auth.svelte.js`(`createAppAuthStore`)· `.env.example` · package.json deps | 4 点。`createAppAuthStore` 自带缺省 zh 文案,**不依赖 app i18n key**;同步引擎/登录 UI 仍手工(照 fitness)。supabase-js 版本**从现役 app 派生**(`fleetDepVersion`),不硬编码以免随时间落后 |
| `supabase-table <t>` | `apps/<id>/supabase/migrations/<ts>_<id>_<t>.sql` | 逐用户 RLS 四策略 + schema/grants;幂等靠 `*_<id>_<t>.sql` 存在性。**只生成不推送** — 安全推送见 `ops/supabase.md`(共享库多 app 迁移会互卡) |
| `portal-card` | **不生成文件**,只打印真实锚点 | 见下 |
| `mcp-server` | `apps/<id>/netlify/functions/mcp.js` + dep | 见 PLAT.GEN.6 |

**id 连字符归一化(踩过的坑):** `create-life-os-app` 允许 `meal-log` 这类带连字符的
id,但连字符在 Postgres 标识符里非法(`meal-log` 被解析成 `meal` 减 `log`)。
`sqlIdent()` 统一把 schema 归一化为 `meal_log`,且 **auth 生成的 `supabase.js` 与
supabase-table 生成的 migration 必须用同一个值**(否则前端连不上自己的表)——
两者已在带连字符 id 上实测一致。

**`portal-card` 为什么只引导不生成:** Portal 的卡不是「一 app 一文件」,而是
`todaySummaryFormat.js` 里的 copy 函数(`{kicker, value, detail, empty}`)+
**两处重复定义的 `SummaryAppId` 联合类型**(`todaySummaryFormat.js:1` 与
`PortalTodaySummary.svelte:14`)+ 一个硬编码可见列表(`:53`);卡片显示什么是
app 专属产品决策。生成一个形状不对的 stub 比不生成更糟(把人往错方向带),
所以脚本只打印这五处真实锚点。

价值:starter 保持薄(不预置 auth,避免每个 app 删代码),能力按需长出;
Backstage 经验:day 2–50 的引导式操作比 day-1 生成影响更大。

**未纳入:** `production` 上线开关 —— manifest 已有 `production` 字段且由
`build-app-registry` 派生(PLAT.GEN.4),改 manifest 重跑即可,无需独立 cap。

### PLAT.GEN.6 — MCP server 能力（新 app day-1 被 AIOS 发现）✅ 2026-07-14

**为什么:** AIOS.20/21 的跨 app 集成是**手写**的 —— 每加一个集成要改 AIOS 源码,
不 scalable。反转成:app 暴露工具,AIOS 的 MCP 客户端(AIOS.23)自动发现。
于是**新增跨 app 能力 = 写几个工具 handler**,AIOS 零改动。

- `packages/mcp-server`(`@life-os/mcp-server`):`createMcpHandler({ name, tools })`
  → 一个 Web Fetch `(Request) => Response`,可直接作 Netlify Function v2 default export。
  协议子集与 `apps/aios/src/lib/mcp.js` 客户端**逐字对齐**:Streamable HTTP +
  JSON-RPC 2.0,`initialize → notifications/initialized → tools/list → tools/call`,
  protocolVersion `2025-06-18`,无状态(不签发 Mcp-Session-Id),含 CORS 预检。
- `add-capability <id> mcp-server` scaffold `netlify/functions/mcp.js`(含 `ping`
  示例工具)+ 依赖;`/api/mcp` 重定向片段打印出来手工接 —— **刻意不自动改
  netlify.toml**:函数目录接线依站点 base dir,planner 的函数就挂在 repo 根
  netlify.toml(见 `ops/netlify.md`),自动改可能改错文件。
- **架构定位:** app 是 `adapter-static` 纯前端不能常驻进程,但都有 Netlify
  Functions —— 把现有 Supabase RPC 包成工具挂 `/api/mcp` 即可。这尊重「apps 禁止
  互引」硬规则:AIOS 仍是唯一跨站行为者,只经 `core_*`/`life_events`/MCP 走。
- **安全模型:** helper 只管协议不做鉴权;数据工具从 `Authorization: Bearer <jwt>`
  取用户 JWT 转发 Supabase,**靠 RLS 逐用户鉴权**;写路径走 `life_events` 收件箱
  (提议 → app 校验),不碰裸 DB。
- **回归测试:** `packages/mcp-server/scripts/mcpHandler.test.mjs`(`npm test -w
  @life-os/mcp-server`)—— 每条断言对应 AIOS 客户端的一处解析(pv/serverInfo ·
  notification 202 空 body · `inputSchema` 缺省补全 · `content[].text` · 非字符串
  返回值 JSON 化 · handler 抛错与未知工具走 `isError` **而非** RPC error ·
  未知方法 -32601 · 坏 JSON -32700 · 非 POST 405 · CORS 预检)。已做**变异验证**:
  改坏 `PROTOCOL_VERSION` 测试即红,还原即绿(非空测试)。
- **验证(2026-07-14):** 普通 id 与**带连字符 id** 两条路径各跑全量 cap +
  `--check` 幂等全绿;生成文件语法自检;`check:app-manifests`(7 app)+
  `check:lifeos-boundaries` 全绿;测试 app 已清理无残留。

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
