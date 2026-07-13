# scripts/

Repo utility scripts. Most are one-off QA / deploy / audit helpers; this README
documents the ones you run to **understand and manage the workspace itself**.

## worktree-status.sh — "how many worktrees/branches, and which is which?"

```sh
scripts/worktree-status.sh
```

Prints a single map:

- **WORKTREES** — every checked-out worktree: its branch, whether it has
  uncommitted changes (`dirty(n)` / `clean`), how far it is from `master`
  (`+ahead/-behind`), and any PR (needs `gh` installed + authed), plus the path.
- **BRANCHES WITHOUT A WORKTREE** — local branches that have no working dir, so
  nothing hides. A branch here with `-<big>` behind and an old PR is usually a
  stale draft.
- **TOTALS** — worktree + branch counts.

Read-only; safe to run anytime. This is the first thing to run when the branch
list feels out of control.

## Worktree / branch model (why there are "so many")

Each ticket runs in its **own git worktree on its own branch**, so multiple
agents (Claude / Codex / Copilot / Fable / Cursor) work in parallel without
stepping on each other's working directory. One worktree ≈ one branch ≈ one
draft PR.

Branch-name prefixes signal intent:

| Prefix        | Meaning                                             |
| ------------- | --------------------------------------------------- |
| `agent/*`     | An agent's implementation ticket                    |
| `feat/*`      | Feature work (human- or model-authored)             |
| `fix/*`       | Targeted fix                                        |
| `fable/*` · `codex/*` · `cursor/*` · `ken-pan-*` | Named by the agent/tool that opened it |
| `evidence/*`  | Before/after evidence snapshot (often disposable)   |
| `integration/*` | Integration branch merging features for testing   |
| `review/*`    | Read-only review copy of someone else's PR          |
| `wip/*`       | Rescued/parked work-in-progress backup (pushed to origin) |

## Keeping it clean (safe order)

1. `scripts/worktree-status.sh` to see the map.
2. Remove worktrees whose PR is **MERGED** (content is already in `master`):
   `git worktree remove <path>` then `git branch -D <branch>`.
3. Remove worktrees with **zero commits ahead** and no uncommitted work (nothing
   to lose).
4. Anything with **uncommitted work** or **local-only commits**: back it up
   first — commit to a `wip/*` branch and push, or save a patch — *then* remove.
   Never `--force`-remove un-backed-up work.
5. `git worktree prune` to clear bookkeeping.

Rule of thumb: a worktree is safe to delete only when its content lives
somewhere durable (merged to `master`, or pushed to `origin`).
