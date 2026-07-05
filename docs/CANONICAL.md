# 以哪个仓库为准？

## ✅ 唯一准绳：`Ken-pan/life-os`

| 做什么 | 在哪里 |
|--------|--------|
| 改 Planner / Fitness / Finance / Music | `apps/planner` 等 |
| 改共享主题、sync | `packages/theme`、`packages/sync` |
| 本地开发 | `cd life-os && npm install`，再 `cd apps/<app>` |
| Push 触发 Netlify | 只 push **`life-os` 的 `master`** |
| CI 验证 | GitHub Actions → `Ken-pan/life-os` |

四站 Netlify 均已指向本仓库（Deploy Key），**不要再依赖独立 app 仓库触发线上部署**。

## ⚠️ Legacy（可逐步清理，勿再当部署源）

### 独立 App 仓库（仍可用于只读 / 归档）

- `Ken-pan/planner-os`
- `Ken-pan/fitness-os`
- `Ken-pan/Moneymoneymoney`
- `Ken-pan/MusicOS`

每个仓库内的 **`packages/life-os-theme`**、**`packages/life-os-sync`** 是 vendored 副本，与 monorepo 重复，**不应再手改**。

### 独立共享包仓库

- `Ken-pan/life-os-theme`
- `Ken-pan/life-os-sync`

若你仍习惯在 sibling 目录改 theme，改完后运行：

```bash
cd life-os && npm run sync:packages && git add packages && git commit
```

**长期建议**：只在 `life-os/packages/*` 改，archive 上述两个独立包仓库。

## 🧹 建议清理清单

| 项 | 动作 |
|----|------|
| `Planner/packages/life-os-theme` 等 vendored 目录 | 独立仓可 **删除**（改 monorepo 后不再 push 独立仓则无害；删前确认无未合并改动） |
| 独立仓 `file:packages/life-os-*` | 若归档独立仓，整仓只读即可 |
| `life-os/apps/*/.github/workflows` 嵌套 CI | 已移除 planner 嵌套 workflow；其余 app 内勿再放 `.github` |
| 磁盘 sibling `../life-os-theme` 依赖 | monorepo 内已用 `packages/*`；**勿**在 monorepo 改回 `file:../` |
| Netlify 上独立仓的 Git 链接 | 已切到 `life-os`；无需再改 |
| `Vault` 或文档里写「packages/life-os-theme 在 Planner 内」 | 更新为 `life-os/packages/theme` |

## 日常命令

```bash
cd "/Users/kenpan/「Projects」/life-os"
npm install
cd apps/planner && npm run dev    # 或 fitness / finance / music

# 提交即四站（按 path ignore）自动构建
git push origin master
```

手动发布四站：`./scripts/deploy-all-netlify.sh`（需 `netlify login`）
