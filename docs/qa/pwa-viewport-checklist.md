# PWA Viewport 验收清单（全 Life OS App）

适用于 **iOS standalone PWA**（主屏幕图标打开）。配置见 `scripts/pwa/apps.config.mjs`。

## 通用项（每个 App）

- [ ] `viewport-fit=cover` in `app.html` / `index.html`
- [ ] 从主屏幕图标打开，`display-mode: standalone` 为 true
- [ ] Header / Tabbar 正常
- [ ] **唯一**主滚动容器（见下表）
- [ ] 嵌套 `.wrap` 非 `height: 0`（Fitness / Music）
- [ ] 可滚到底，最后一项不被 tabbar 挡
- [ ] 横竖屏切换无新黑块

## 各 App 主滚动容器

| App     | 滚动容器                | 嵌套 `.wrap`      |
| ------- | ----------------------- | ----------------- |
| Planner | `.main-col > .wrap`     | 即滚动面本身      |
| Fitness | `#main-content`         | 须 `height: auto` |
| Music   | `#main-content`         | 须 `height: auto` |
| Finance | `.main-wrap > .content` | N/A               |
| Portal  | `.main-col > .wrap`     | 即滚动面本身      |

## 自动化（不能替代 standalone）

```bash
npm run test:pwa
PWA_APP=fitness npm run test:pwa
npm run qa:mobile-scroll
```

## Metrics

```bash
npm run pwa:metrics
```

Standalone 页粘贴 snippet，记录 `displayModeStandalone`、`main.overflowY`、`wrap.height`。

## If-Then

| If                                       | Then                                             |
| ---------------------------------------- | ------------------------------------------------ |
| 仅 Fitness/Music 裁剪                    | 查 `#main-content` vs 后代 `.wrap` 的 `height:0` |
| 仅 Planner/Portal                        | 查 `.main-col > .wrap` flex 链                   |
| 仅 Finance                               | 查 `.main-wrap > .content`；确认已登录进 shell   |
| Playwright 过、Simulator standalone 失败 | 继续查 `ios-safari.css` + 真机                   |
