# @life-os/sync

Life OS shared sync utilities. Planner / Fitness / Finance use the full bidirectional sync path; Music currently uses shared primitives such as auth storage, visibility/debounce helpers, and sync notification plumbing while keeping Dexie sync app-specific.

## 安装（monorepo）

本包位于 `life-os/packages/sync`。各 app 通过 npm workspace 引用：

```json
{
  "dependencies": {
    "@life-os/sync": "*"
  }
}
```

在 monorepo 根目录运行 `npm install` 即可链接。

## 导出

| API | 用途 |
|-----|------|
| `LIFE_OS_AUTH_STORAGE_KEY` | Supabase auth localStorage 键 |
| `readSyncMeta` / `writeSyncMeta` | 按 appId 读写 sync meta |
| `createBidirectionalSync` | 双向同步（cooldown + debounce） |
| `createDebouncedTask` | 通用 debounce 任务 |
| `bindVisibilitySync` | 页面可见时触发 sync |
| `createAuthSyncHandler` | Supabase auth 事件 → sync |
| `createSyncNotify` / `formatSyncErrorMessage` | sync error pub/sub + user-facing error text |

## 维护

- 同步策略、cooldown、meta 键：**只改** `src/` 下模块
- 勿在各 app 内 vendored 副本；GitHub 上 `life-os-sync` 独立仓已归档
- Sync presentation contracts belong in `@life-os/contracts`; merge/transport implementation stays here. See [`../../docs/LIFEOS_SHARED_BOUNDARIES.md`](../../docs/LIFEOS_SHARED_BOUNDARIES.md).

同目录另有共享包 **`@life-os/theme`**（`packages/theme`）。
