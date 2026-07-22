# Native + MCP Tool Governance (G4)

> The assistant's native (Tauri-only) tools are its highest-capability surface and were
> previously executed with NO Action-Registry/Approval governance (early return in
> `tools.js` before `guardToolAction`). This closes that gap: every native tool is
> classified, write-capable tools are hard-disabled for autonomous/background execution,
> and the native dispatch now runs `guardNativeToolCall` BEFORE `executeNativeTool`.

## Inventory & classification

| Tool | Surface | Class | Autonomous | Manual (explicit approval) |
|---|---|---|---|---|
| check_task | native | read-only | ✅ allow | ✅ |
| read_cursor_sessions | native | read-only | ✅ | ✅ |
| read_cursor_thread | native | read-only | ✅ | ✅ |
| search_cursor_sessions | native | read-only | ✅ | ✅ |
| ai_app_read | native | read-only | ✅ | ✅ |
| look_at_screen | native | read-only | ✅ | ✅ |
| ai_app_send | native | external write | ❌ deny | ✅ (manualApproved) |
| type_into_app | native | external write | ❌ | ✅ |
| open_mac_app | native | external write | ❌ | ✅ |
| delegate_task | native | external write | ❌ | ✅ |
| cancel_task | native | external write | ❌ | ✅ |
| run_applescript | native | **sensitive/destructive** | ❌ | ✅ (UI must preview) |
| github_cli | native | **sensitive/destructive** | ❌ | ✅ (UI must preview) |
| planner_add_task (built-in) | AIOS | internal reversible write | via registry (R1 auto) | — |
| save_memory / start_focus / end_focus | AIOS | internal reversible write | via registry (R1 auto) | — |
| planner MCP add_task / complete_task | MCP | internal reversible write (governed RPC) | policy-checked + server RPC | — |
| finance / fitness MCP | MCP | read-only (`portal_today_summary`) | ✅ | — |
| open_space, compose_library_note, open/interact browser | AIOS | read-only / navigation (R0) | ✅ | — |

**Prohibited-autonomous set:** `run_applescript, github_cli, type_into_app, ai_app_send, delegate_task, open_mac_app, cancel_task` — every write-capable native tool. They are denied in the assistant's autonomous loop and require an explicit human-in-the-loop `manualApproved` flag (set only by a UI confirmation) to run at all.

## Enforcement

- `apps/aios/src/lib/kenos/actionPipeline.core.js` → `NATIVE_TOOL_CLASS` + `guardNativeToolCall(name, {autonomous, manualApproved})`. Fail-closed: unknown native tool → deny; `autonomous` defaults **true**.
- `apps/aios/src/lib/tools.js` → the native early-return calls `guardNativeToolCall` **before** `executeNativeTool`; the MCP early-return policy-checks any MCP tool that maps to a registry action. A regression test asserts `guardNativeToolCall` precedes `executeNativeTool` in source (no bypass).
- Classification is a fixed map — **risk cannot be lowered** (a sensitive tool can never be treated as read).

## Negative tests (all green — `actionPipeline.core.test.js`)

1. unregistered native tool → denied (fail-closed)
2. risk cannot be lowered (sensitive stays sensitive; autonomous+manualApproved still denied)
3. changed parameters invalidate Approval (`approvalBindingValid` → `parameters_changed`)
4. external content in args cannot authorize (guard reads only `name`+`ctx`, never tool args; smuggled `approvedByContent` ignored)
5. background/autonomous execution cannot invoke manual-only tools (all 5+ write-capable denied under `autonomous:true`)
6. frozen actions remain frozen (`policyDecision('work.*')` → deny)

## Remaining work (Owner-gated, next milestone)

Full routing of write-capable native tools through `normalize → Action Registry → policy → Approval → executor → Activity` (so a manual run also produces an approval record + activity entry). Until then they are hard-disabled for autonomous execution and manual-approval-gated — the safe interim state. No native tool was executed during testing; only the dispatch/policy layer was exercised.
