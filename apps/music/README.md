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
cd "/Users/kenpan/「Projects」/MusicOS"
npm install
npm run dev
```

## 设计系统

```css
@import '@life-os/theme/design-system.css';
@import '@life-os/theme/music-shell.css';
```

品牌 token 见 `src/app.css`。
