# Roadmap 发货日志

从 hub §Shipped 链入。格式：**日期 · 摘要 · commit（可选）**

维护：每次完成 hub §Now 项后追加一行；不必复制整表。

---

## 2026-07-08

| 主线        | 摘要                                                             | Commit     |
| ----------- | ---------------------------------------------------------------- | ---------- |
| Design      | D-P4 state matrix + CommandPalette showcase + P5 pixel baselines | `2a7ad397` |
| Design      | D-P4a matrix grid；smoke 扩至 152                                | `02c3733a` |
| Design      | D-P3 catalog UX + toast spacing + visual audit                   | `ff37d401` |
| Design      | D-P3 banner tokens + P3c button/segment/toggle                   | `7491989f` |
| Design      | D-P3b settings/toast/navigation deep tokens                      | `bbdb27cd` |
| Design      | D-P3a card primitive + component tokens                          | `f397abb6` |
| Design      | design-tokens 包 + 四站品牌迁移 D-P1/P2                          | `13d78f67` |
| Design      | design-catalog thin preview D-P0                                 | `e47992fa` |
| Integration | Portal DNS `portal.kenos.space` 上线验证                         | —          |
| Docs        | Roadmap 拆分为 hub + `docs/roadmap/` 分卷                        | —          |

## 2026-07-07

| 主线        | 摘要                                             | Commit            |
| ----------- | ------------------------------------------------ | ----------------- |
| Platform    | C-P2 Wave 1 / 1.5 / 2 / 2.5 运行时与组件收编     | 见 git log `C-P2` |
| Integration | I-P0 migration `20260707230000` 远程 apply       | —                 |
| Integration | I-P1.5 migration `20260708000000` + outbox smoke | —                 |

---

## Platform Wave 明细（归档）

### Wave 1 运行时

| 提取项          | 落点                                          |
| --------------- | --------------------------------------------- |
| Supabase client | `@life-os/sync` `createLifeOsSupabaseClient`  |
| Auth 生命周期   | `createLifeOsAuth`                            |
| i18n            | `platform-web` `createI18n`                   |
| CommandPalette  | `@life-os/platform-web/CommandPalette.svelte` |

### Wave 1.5

Finance AuthGate、`platform-web` Toast、events RFC、`themePreference`、backup 骨架。

### Wave 2 组件

`head` / `icon` / `sync-error` / `navigation` / `settings/*` / `toast` / `backup`。

### Wave 2.5 品牌

`@life-os/theme/brand`；`AppBrand`；Finance `AppBrand.tsx`。

### Wave 3 P0 / P1+

PortraitGate、localCache、Portal AppBrand、MobileMoreSheet、Portal auth、Music contracts、Finance events smoke、Planner `lifeEventsInbox`。
