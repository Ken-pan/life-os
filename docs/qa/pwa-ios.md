# iOS PWA Debug — Life OS（全 App 统一）

所有 Life OS app 共用一套 PWA 调试配置：`scripts/pwa/apps.config.mjs`。

## App 一览

| App     | Workspace    | Preview 端口 | Shell 类型          | 主滚动容器                                                                             |
| ------- | ------------ | ------------ | ------------------- | -------------------------------------------------------------------------------------- |
| Planner | `planner-os` | 5188         | `main-col-wrap`     | `.life-os-shell-column > .life-os-page-workspace`（SSOT: `@life-os/theme` `shell.js`） |
| Fitness | `fitness-os` | 4173         | `main-wrap-main`    | `.main-wrap > #main-content`                                                           |
| Music   | `music-os`   | 5191         | `main-wrap-main`    | `.main-wrap > #main-content`                                                           |
| Finance | `finance-os` | 5180         | `main-wrap-content` | `.main-wrap > .content`                                                                |
| Portal  | `portal`     | 5195         | `main-col-wrap`     | 同 Planner（`.life-os-shell-column` 滚动面）                                           |
| Home    | `home-os`    | 5196         | `main-col-wrap`     | `.app-shell`                                                                           |

共享 CSS：`packages/theme/src/ios-safari.css`

## 视口高度（standalone 必读）

iOS standalone PWA **冷启动**时 `100dvh` / `visualViewport.height` 会比真屏矮约 `env(safe-area-inset-top)`，底部会出现黑缝。Life OS 策略：

| 模式           | `--app-vh`                                   |
| -------------- | -------------------------------------------- |
| Safari 浏览器  | `visualViewport` 像素值（随 URL 栏变化）     |
| standalone PWA | `100vh`（键盘弹出时临时跟 `visualViewport`） |

实现：`packages/theme/src/viewportSync.js` + 各 app `app.html` 首屏 bootstrap。

**灵动岛下细线**：根因是 `.safari-chrome-tint-top` 与 `.appbar` 在 `safe-top` 边界叠出 1px hairline（**Safari 浏览器与 standalone 均有**）。策略：移动端有顶栏时一律隐藏 tint，由 `.appbar-inner` 的 `padding-top: max(59px, safe-top)` 单层绘制；standalone 另加 `app-shell::after` 4px 接缝覆盖。验收：`node scripts/pwa/capture-chrome-screenshots.mjs` 看 `tintDisplay: "none"` + Xcode `npm run pwa:sim:shot`。

## 验证分层

```txt
L1  npm run test:pwa              Playwright 移动 + standalone-pwa class
L2  npm run qa:mobile-scroll      四端生产 app 滚动 QA
L3  npm run pwa:sim:open           iOS Simulator Safari
L4  手动 Add to Home Screen       真 standalone
L5  Safari Web Inspector          computed style / metrics
L6  真机 iPhone                   最终验收
```

## 标准命令（repo 根目录）

```bash
# 构建
npm run pwa:build                 # 六站全部
npm run build:fitness             # 单端

# Preview（标准端口，与 apps.config 一致）
npm run pwa:preview:fitness
npm run pwa:preview:planner
# 或各 app 内：npm run pwa:preview

# 自动化
npm run pwa:healthcheck           # 预检全部 app preview
PWA_APP=fitness npm run pwa:healthcheck
npm run test:pwa                  # Playwright 全 app
PWA_APP=fitness npm run test:pwa  # 单 app
npm run qa:mobile-scroll          # 生产四端滚动
SCROLL_QA_APPS=planner,fitness npm run qa:mobile-scroll
npm run qa:pwa                    # healthcheck + test:pwa + scroll（preview 需已启动）

# iOS Simulator
npm run pwa:sim:open -- fitness /discover
npm run pwa:sim:shot -- fitness-discover-pwa

# Viewport metrics（Web Inspector Console）
npm run pwa:metrics
```

## 单 App 验收路由

| App     | 必测路由                                         |
| ------- | ------------------------------------------------ |
| Fitness | `/` `/program` `/discover` `/settings`           |
| Planner | `/` `/settings` `/calendar`                      |
| Music   | `/` `/library` `/settings`                       |
| Finance | `/`（需登录才有 `.app-shell`；未登录测 auth 屏） |
| Portal  | `/`                                              |

### Music 播放加载验收（M-P8）

1. 播放同一首云曲两次 → Settings「播放加载指标」第二次来源应为 IDB/本地，P95 可播应明显低于冷启动
2. 滚动曲库 / 首页 Quick Picks → Network 可见预暖（pointerdown 或可见行）
3. 飞行模式点未缓存曲目 → MiniPlayer / 状态提示「离线且未缓存此曲」

## Standalone PWA（手动，全 app 相同）

1. `npm run pwa:preview:<app>`
2. `npm run pwa:sim:open -- <app> /`
3. Safari → Share → **Add to Home Screen**
4. 从主屏幕图标打开
5. `npm run pwa:sim:shot -- <app>-pwa-<page>`

## Safari Web Inspector

Develop → [Simulator / iPhone] → [页面] → Console → 粘贴 `npm run pwa:metrics` 输出的 snippet。

## 配置文件

| 文件                                   | 作用                                 |
| -------------------------------------- | ------------------------------------ |
| `scripts/pwa/apps.config.mjs`          | **SSOT** — 端口、shell、路由、选择器 |
| `scripts/life-os-mobile-scroll-qa.mjs` | 滚动 QA（读 config）                 |
| `tests/pwa/mobile-viewport.spec.ts`    | Playwright（按 project 分 app）      |
| `playwright.config.ts`                 | 每 app 独立 preview webServer        |
| `.cursor/rules/pwa-ios-debug.mdc`      | Cursor 诊断规则                      |

修改端口或路由时**只改 `apps.config.mjs`**，其余自动同步。

## Finance 特别说明

Finance 有 `AuthGate`：未登录时无 `.app-shell`，仅 `.auth-screen`。自动化会：

- `test:pwa`：auth 屏做基础 viewport 检查
- `qa:mobile-scroll`：检测到 auth 屏则跳过 shell 滚动测试

## 相关文档

- [`pwa-viewport-checklist.md`](./pwa-viewport-checklist.md) — 验收清单
