# @life-os/sync

Life OS 四端（Planner / Fitness / Finance / Music）共享云同步逻辑。

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

## 维护

- 同步策略、cooldown、meta 键：**只改** `src/` 下模块
- 勿在各 app 内 vendored 副本；GitHub 上 `life-os-sync` 独立仓已归档

同目录另有共享包 **`@life-os/theme`**（`packages/theme`）。
