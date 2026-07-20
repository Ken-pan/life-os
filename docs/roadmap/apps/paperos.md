# PaperOS — moved to its own repo

PaperOS (reMarkable Paper Pro Move device client, device ops scripts, and all
PaperOS docs/QA gates) was extracted from this monorepo on 2026-07-12 into a
standalone repo with full git history:

**`/Users/kenpan/「Projects」/paperos`**

## 终局（本仓边界）

> 北极星问题：**怎么安静地读和想？** 产品终局写在 **paperos 独立仓**，不在 life-os 展开。

**life-os Done when：** Planner `/api/paper/*` provider 保持可用；设备 Shell / 真机 gate **不**在本仓重开。

**故意不做：** 在 life-os 再造 PaperOS 设备主航道或占 hub §Now。

What moved: `apps/planner-device/`, `apps/planner/paper-device/`,
`docs/qa/paperos/`, `docs/archive/paperos/`, `docs/architecture/paperos-*.md`,
`docs/ops/paperos-device.md`, this roadmap file, and the in-flight
`agent/papr-*` / `p-move` branches (filtered to PaperOS paths).

What stayed here: the Planner-side provider API —
`apps/planner/netlify/functions/paper-*.mjs`, `apps/planner/server/paperService.mjs`,
and the Supabase paper-device migrations. Planner remains the first data
provider for PaperOS via `https://planner.kenos.space/api/paper/*`.
