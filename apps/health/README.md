# HEALTH.OS — 状态与专注调节中枢

HealthOS 已从 starter 晋升为 Life OS 第九个产品 app。主形态是 Tauri macOS app +
本地 Focus agent + Watch/iPhone HealthKit companion；当前不部署 Netlify，
`app.manifest.json` 保持 `production: false`。

## 已落地

| 阶段 | 能力 |
| --- | --- |
| HLT-0 | LifeOsAppShell、九 app 注册表/PWA 矩阵、Tauri macOS 壳 |
| HLT-1 | Focus agent：前台 app / CPU / 键鼠信号、预警与休息干预 |
| HLT-2 | 六维 State Engine：energy/focus/recovery/stress/sleepDebt/physical |
| HLT-3 | 纯信号驱动状态 + 自适应专注窗口，策略回推 Focus agent |
| HLT-4 | 睡眠 / HRV / 静息心率 / 步数趋势与个人基线 |

## 数据链路

- macOS 没有 HealthKit。持续数据经 `companion/` 的 iPhone/watchOS app 读取，
  再通过 iCloud Drive inbox 或 LAN `POST :5193/ingest` 交给 Mac agent。
- companion 源码与 XcodeGen 工程已交付，模拟器工程已验证；真机签名、HealthKit
  授权与持续交付仍待设备 gate。
- 回退路径：agent 可流式解析 Apple Health `export.xml`。
- 原始健康数据只落 `~/Library/Application Support/HealthOS/`，不进 Supabase。

详见 [`docs/data-sources.md`](./docs/data-sources.md) 与
[`docs/roadmap/apps/health.md`](../../docs/roadmap/apps/health.md)。

## 命令

```bash
npm run test -w health-os
npm run check -w health-os
npm run build -w health-os
npm run app:health
```
