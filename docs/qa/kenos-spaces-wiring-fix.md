# Spaces wiring fix — 2026-07-20

## Diagnosis

Spaces catalog / bridges / Continue store already existed, but “真正工作”被三件事打断：

1. `noteSpaceVisit('/spaces/plan')` 用 bridge 路径 **冲掉** 已记住的 `https://planner…/upcoming`
2. Today / Sidebar 直接链生产根域名，**绕过** hosted bridge + `resolveSpaceOpenHref`
3. Domain origins 手写，与 `LIFE_OS_APP_ORIGINS` 分裂

**正确方式（已实施）：** hosted bridge + state-restored `window.open`；不上 iframe。

## Changes

| Area                  | Fix                                                                     |
| --------------------- | ----------------------------------------------------------------------- |
| `applySpaceVisit`     | bridge 访问不覆盖 known-domain https resume                             |
| Today Spaces          | `TODAY_SPACE_SHORTCUTS` → `/spaces/*` · `/work`                         |
| Sidebar Recent        | `launchSpace` / `resolveSpaceOpenHref`                                  |
| Continue sheet        | 共用 `launchSpace`                                                      |
| Origins               | `DOMAIN_ORIGINS` ← `LIFE_OS_APP_ORIGINS`；resume 校验含 localhost ports |
| Knowledge bridge      | 文案与目录对齐                                                          |
| Today priority/signal | `listKeyForDomainHref` + `rememberExternalResume`                       |

## Verification

- Unit: aios **139 pass**
- Preview smoke (`?kenosDemo=1`):
  - Continue → Fitness `/day/chest/focus`
  - 进 `/spaces/plan` 后 Plan resume 仍为 `/upcoming`
  - Continue Plan → `https://planner.kenos.space/upcoming`
  - Money bridge CTA → Finance `/home/today`
  - Today Spaces 全为 in-app 路径

Preview: `http://127.0.0.1:5291/?kenosDemo=1`
