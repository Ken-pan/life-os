# Portal Roadmap

**URL：** [portal.kenos.space](https://portal.kenos.space) · **Workspace：** `portal` · **Dev 端口：** 5195

## 一句话

六站启动器 + `core_*` 读模型 + 今日摘要；Growth **G-P1–G-P5 ✅**。

## 当前能力（生产）

| 域        | 状态 | 要点                                         |
| --------- | ---- | -------------------------------------------- |
| Launcher  | ✅   | 四生产 + Home 实验（H-P1）                   |
| G-P1–G-P5 | ✅   | 继续 · 角标 · 默认跳转 · 三卡摘要 · PWA 引导 |
| Auth / ⌘K | ✅   | Portal 内登录 · `CommandPalette`             |
| 测试      | ❌   | 无 `test:e2e`；`apps/portal/README.md` 过时  |

## Next（按 ROI）

| ID                     | 主题                              | ROI | 桶     | 投入   | 验收                        | Hub      |
| ---------------------- | --------------------------------- | --- | ------ | ------ | --------------------------- | -------- |
| **G-P4b-M** {#g-p4b-m} | 摘要扩 **Music** 卡               | ◆   | Growth | ~1d    | 第四卡 + RPC                | ✅ §Next |
| **G-P4b-H**            | Home 储藏卡                       | ○   | Growth | 1d     | 先 H-P6a                    | hub ○    |
| **G-P6**               | ⌘K 跨站深链 + 最近搜索            | ◆   | Growth | 2d     | CommandPalette 直达各站路由 | —        |
| **G-P8**               | pending 角标 → Planner inbox 深链 | ○   | Growth | 0.5–1d | 可点击跳转                  | —        |
| **G-P9**               | Portal smoke（登录 → 三卡）       | ○   | Infra  | 1d     | script 或 Playwright        | —        |
| **G-P0**               | 更新 `apps/portal/README.md`      | ○   | Docs   | 0.5h   | 与 hub 一致                 | —        |

### G-P4b 子项与依赖

| 卡        | 数据源              | 潜力 / 阻塞                     |
| --------- | ------------------- | ------------------------------- |
| **Music** | `music.play_events` | **#3** — 无阻塞，复制 G-P4      |
| **Home**  | localStorage        | 阻塞 **H-P6a**；勿与 Music 同批 |

### 实现锚点

| ID    | 文件 / 位置                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------- |
| G-P4b | `migrations/*_portal_today_summary_rpc.sql` · `apps/portal/src/lib/todaySummary.js` · `PortalTodaySummary.svelte` |
| G-P6  | `CommandPalette` · `packages/theme/launcher.js` URLs                                                              |
| G-P8  | `PortalAppBar.svelte` pending 角标                                                                                |

## 验收命令

```bash
cd apps/portal
npm run dev                  # :5195
npm run build
./scripts/verify-life-os-identity-p0.sh   # SSO 相关
```

## Parked / Not doing

聊天 Agent 仪表盘 · 第三方 SaaS 聚合 · Home 与四站同权重默认展示
