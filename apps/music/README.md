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
