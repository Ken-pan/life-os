# @life-os/sync

Life OS 三端（Planner / Fitness / Finance）共享云同步逻辑。

## 安装

```json
{
  "dependencies": {
    "@life-os/sync": "file:../life-os-sync"
  }
}
```

目录结构：

```
Projects/
  life-os-sync/      ← 本包（唯一维护点）
  life-os-theme/
  Planner/
  Fitness/
  Moneymoneymoney/
```

## 导出

| API | 用途 |
|-----|------|
| `LIFE_OS_AUTH_STORAGE_KEY` | Supabase auth localStorage 键 |
| `readSyncMeta` / `writeSyncMeta` | 按 appId 读写 sync meta |
| `createBidirectionalSync` | 双向同步（cooldown + debounce） |
| `createDebouncedTask` | 通用 debounce 任务 |
| `bindVisibilitySync` | 页面可见时触发 sync |
| `createAuthSyncHandler` | Supabase auth 事件 → sync |

## 维护

- 同步策略、cooldown、meta 键：**只改** `src/` 下模块
- 各 app 不再保留 `packages/life-os-sync` 或 `vendor/life-os-sync` 副本

同目录另有共享包 **`@life-os/theme`**（`../life-os-theme`）。

远程 CI 可使用：

```json
"@life-os/sync": "github:Ken-pan/life-os-sync"
```
