# MUSIC.OS

本地音乐播放器 PWA · Life OS 设计系统 · 红色感性品牌

## 功能

- 导入本地音频（MP3 / M4A / FLAC / WAV 等）
- 资料库、专辑、艺术家、歌单、搜索、红心收藏
- 正在播放 / Mini Player / 队列
- 随机 · 循环 · Media Session（锁屏控制）
- 离线 PWA · 数据仅存本机 IndexedDB

## 开发

```bash
cd "/Users/kenpan/「Projects」/life-os/apps/music"
npm install
npm run dev
```

## iOS 应用（Capacitor）

同一套 Web 代码经 Capacitor 打包为原生 iOS 应用（`ios/`，SPM 模式，无需 CocoaPods）：

- **真后台播放**：`UIBackgroundModes: audio` + `AVAudioSession(.playback)`，锁屏/切后台不再被 Safari 挂起（模拟器实测：锁屏后整曲播完）
- **锁屏/控制中心/灵动岛控制 + 来电中断/拔耳机处理**：共享插件 [`@life-os/capacitor-nowplaying`](../../packages/capacitor-nowplaying)，`cap sync` 自动注册；Web 侧分支在 `src/lib/mediaSession.js`
- 原生壳内自动跳过 service worker（`@life-os/platform-web/sw-lifecycle` 内建）

平台级 iOS 工作流与新 app 接入见 [`docs/ops/ios.md`](../../docs/ops/ios.md)。

```bash
npm run ios:sync       # 构建 Web 产物并同步进原生工程
npm run ios:open       # 在 Xcode 中打开（真机部署/签名）
npm run ios:build:sim  # 命令行构建模拟器包
```

真机安装：`ios:open` 后在 Xcode 里选择自己的开发者账号签名，连接 iPhone 运行。

## 设计系统

```css
@import '@life-os/theme/design-system.css';
@import '@life-os/theme/music-shell.css';
```

品牌 token 见 `src/app.css`。

Monorepo 文档入口见 [`../../docs/README.md`](../../docs/README.md)；旧独立 `MusicOS` 仓库已归档。

## Life OS 集成

| 主线                | 状态 | 说明                                                                                                                |
| ------------------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| **INTG.IDENTITY.0** 身份       | ✅   | `@life-os/sync`：`createCoreIdentityHandler('music')` + SSO                                                         |
| **PLAT.CONTRACTS.1+** contracts | ❌   | 仅 `@life-os/theme`；nav / sync error 契约未接                                                                      |
| Supabase            | 🟡   | `music` schema + 标签/推荐 RPC；见 [`docs/TAGGING-RECOMMENDATION-STATUS.md`](docs/TAGGING-RECOMMENDATION-STATUS.md) |

路线图：[`../../docs/LIFEOS_ROADMAP.md`](../../docs/LIFEOS_ROADMAP.md) · Supabase：[`../../docs/ops/supabase.md`](../../docs/ops/supabase.md)
