# KNOW.VAULT.0 — 用户验收清单

> **状态：** 代码已在（`watchVaultChanges` + layout 启动）；需 **rebuild 原生 app** 后人工点一次。
> **Agent 2026-07-18：** 本机 Vault 探针显示 7d 内 **130** 篇 `.md` 有改动 → 日用真源在转，值得验收 watcher。

## 前置

```bash
cd "/Users/kenpan/「Projects」/life-os"
npm run app:knowledge   # → /Applications/KnowledgeOS.app
```

确认 Info / 壳为最新（含 Tauri fs watch）。

## 步骤（约 2 分钟）

1. 打开 **KnowledgeOS.app**，进 `/library`，确认笔记列表已加载。
2. 设置页或状态里确认 **外部变更监听** 为开（`vaultWatching`；失败时看控制台 `[vault] watcher 启动失败`）。
3. **不关 KnowledgeOS**，用 Obsidian / 终端另写一篇：

   ```bash
   echo "---\ntitle: vault0-probe\n---\nprobe $(date)" >> "$HOME/「Projects」/Vault/vault0-probe-$(date +%Y%m%d).md"
   ```

4. **约 1–2 秒内** library 应出现新笔记（或刷新后可见）；无需手动「重新加载 Vault」。
5. （可选）在 Obsidian 改已有笔记标题/正文，确认列表 mtime / 内容跟上。

## 通过 / 失败

| 结果 | 动作 |
| --- | --- |
| ✅ 外部写入自动进库 | 在 [`knowledge.md`](../roadmap/apps/knowledge.md) 把 VAULT.0 标用户验收 ✅；可进日用 |
| ❌ 无反应 | 开 DevTools / 终端看 watcher 错误；确认 Vault 路径仍是 `~/「Projects」/Vault` |
| ❌ 仅网页端 | 网页无 Tauri watch（预期 no-op）；必须用 `.app` |

## 故意不做

- 验收前不上 Vault 云同步（`KNOW.SYNC.1`）
- 不为 watcher 另造第二套索引服务
