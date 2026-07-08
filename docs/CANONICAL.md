# 以哪个仓库为准？

## ✅ 唯一准绳：`Ken-pan/life-os`

| 做什么                                 | 在哪里                                                  |
| -------------------------------------- | ------------------------------------------------------- |
| 改 Planner / Fitness / Finance / Music | `apps/planner` 等                                       |
| Portal（I-P1 WIP）                     | `apps/portal` — 见 `docs/LIFEOS_ROADMAP.md`             |
| 改共享主题、sync、contracts            | `packages/theme`、`packages/sync`、`packages/contracts` |
| 本地开发                               | `cd life-os && npm install`，再 `cd apps/<app>`         |
| Push 触发 Netlify                      | 只 push **`life-os` 的 `master`**                       |
| CI 验证                                | GitHub Actions → `Ken-pan/life-os`                      |

四站 Netlify 均已指向本仓库（Deploy Key），**不要再依赖独立 app 仓库触发线上部署**。

## ⚠️ Legacy（已归档，勿再使用）

以下 GitHub 仓库已 **archive**，本地 sibling 目录仅作历史参考：

- `Ken-pan/planner-os`、`fitness-os`、`Moneymoneymoney`、`MusicOS`
- `Ken-pan/life-os-theme`、`life-os-sync`

vendored `packages/life-os-*` 已从独立 app 仓删除。Netlify **不会**再监听这些仓库。

## 🧹 清理状态（2026-07-05）

| 项                                 | 状态                                                              |
| ---------------------------------- | ----------------------------------------------------------------- |
| 独立 app 仓 vendored packages      | ✅ 已删                                                           |
| 独立仓 `netlify.toml`              | ✅ 已删                                                           |
| GitHub archive                     | ✅ 六仓已归档                                                     |
| Netlify Git 源                     | ✅ 四站指向 `life-os`                                             |
| `NETLIFY_AUTH_TOKEN` GitHub secret | ✅ 已配置（手动 GHA 部署可用）                                    |
| Planner `KIMI_API_KEY`             | ✅ 已配置                                                         |
| Music 生产 URL                     | ✅ https://music.kenos.space（rollback: musicos-ken.netlify.app） |
| Netlify 命名                       | ✅ 四站统一 `{app}os-ken.netlify.app`                             |
| Portal `home.kenos.space`          | 🟡 代码 WIP；Netlify 站未建（见 roadmap I-P1）                    |
| 本地 sibling 目录                  | ✅ 已删除（见 `docs/LEGACY_LOCAL.md`）                            |
| Cursor 工作区                      | ✅ `Projects/life-os.code-workspace` + `.cursor/rules`            |
| 平台 Supabase 文档                 | ✅ `docs/SUPABASE.md`（迁移状态 + `supabase-sql.sh`）             |

## 日常命令

```bash
cd "/Users/kenpan/「Projects」/life-os"
npm install
cd apps/planner && npm run dev    # 或 fitness / finance / music

# 提交即四站（按 path ignore）自动构建
git push origin master
```

手动发布四站：`./scripts/deploy-all-netlify.sh`（需 `netlify login`）
