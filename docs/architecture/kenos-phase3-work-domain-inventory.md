---
title: Kenos Phase 3 Work domain inventory
owner: kenpan
last_verified: 2026-07-19
doc_role: phase3-inventory
status: temporary-approved-for-phase-3-work-foundation
---

# Kenos Phase 3 — Work domain inventory

> Repository facts only. No production apply, writer cutover, Executor, or Phase 4/5.
> Temporary ownership: `TEMPORARY_APPROVED_FOR_PHASE_3_WORK_FOUNDATION` — must be re-reviewed before production cutover; not a permanent Constitution clause.

## Verdict

There is **no** Work Space app, `work.*` production table, Meeting entity, or Connector runtime that writes canonical Work. Work-adjacent capability is fragmented across Plan, Library, Assistant, Portal projections, and **external** Obsidian / WST sources. Phase 3 foundation therefore introduces **additive** Work contracts + review-only persistence + AIOS-hosted UI, without claiming an existing Work second truth or retiring Planner projects.

## Ownership snapshot (temporary)

| Object | Owner | Not owner |
| --- | --- | --- |
| Work Project / Deliverable / Meeting / Decision / Work Context / statuses / source refs | **Work** | Plan, Library, Assistant, Connector, Portal |
| Task / schedule / due / completion / recurrence / personal execution queue | **Plan** | Work, Assistant, Connector |
| Document / note / research / knowledge asset / attachment metadata (existing) | **Library** | Work (refs only) |
| Approval lifecycle / Activity contract / Policy / EntityRef+Action envelopes | **Platform/System** | Domains may reference |
| Assistant | Reads Work projections; submits Actions; displays context | Must not own Project/Deliverable/Meeting/Decision/Task/Document |
| Connector | CaptureEnvelope / source reference only | Must not auto-create canonical Work/Plan/Library |

## Source inventory

| Source | Path evidence | Current owner | Writer | Readers | Canonical / projection | Security | Classification | Remote/local | Offline | Retention | Deep link | Duplicates / cutover risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Planner projects | `apps/planner/src/lib/domain/projects.js`, `planner_projects` SQL | Plan | Planner UI + sync | Planner, Knowledge merge | **Canonical Plan project** (task grouping) | personal | personal | local + cloud mirror | yes (local-first) | app store | Planner routes | **Not** Work Project; may EntityRef later |
| Planner tasks | `tasks.js`, `planTaskCommand.js`, `planner_tasks` | Plan | Plan command / MCP / events (compat) | Planner, AIOS Inbox | **Canonical Task** | personal | personal | local + cloud | yes | app store | Planner | Dual writers until cutover; Work must not duplicate |
| Knowledge projects board | `apps/knowledge/src/lib/projects.js` | Library fusion | Vault notes | Knowledge UI | Projection (Vault ⊕ git ⊕ Planner) | personal | personal/work by content | local Vault | yes | Vault | Knowledge | Title/slug overlap with Plan projects |
| Home spatial projects | `apps/home` `S.projects` | Home | Home UI | Home / MCP | Household canonical | household | personal | local + cloud | yes | app | Home | Name collision only |
| Portal today summary | `portal_today_summary` RPC | Cross-domain read | Domain writers | Portal, AIOS Today | Projection | mixed | mixed | remote RPC | no | N/A | domain hrefs | No Work project list |
| AIOS chat / digests | `apps/aios/src/lib/chat.svelte.js` prompts | Assistant context | External digests | LLM | Prompt projection of Work | work | work_confidential possible | Vault external | partial | Vault policy | Obsidian paths | Strongest de-facto Work context; **outside** monorepo tables |
| Obsidian Work/* | Agent Vault (external) | User / curator | Obsidian / curator | AIOS notes tools | External Work knowledge | work | work_confidential | local Vault | yes | Vault | note paths | Must not mirror bodies into personal cloud (OPEN-002) |
| Knowledge Library | `apps/knowledge` | Library | Knowledge UI | AIOS, wikilinks | Canonical Library | personal | by note | local | yes | Vault | Library | Work may ref only |
| Wikilinks | `packages/platform-web` wikilinks | Platform leaf | markdown authors | Planner/Finance | Deep-link helpers | personal | personal | local | yes | N/A | `[[note]]` | Not EntityRef yet |
| Meetings | — | — | — | — | **ABSENT** | — | — | — | — | — | — | Target-only; Phase 3 creates WorkMeeting |
| Deliverables / Decisions (product) | RFC `work.add_decision` only | Target Work | unimplemented | — | Target | work | work_confidential | — | — | — | — | Distinct from Approval “decision” |
| Kenos Approval | Phase 2 contracts + review SQL | Platform/System | review-only | AIOS Approvals | Policy Approval | system | varies | disposable | N/A | N/A | `/approvals` | Name collision with WorkDecision |
| Jira / Figma / Gmail / Calendar | docs + AIOS digest mentions | External | External | Digests | External | work | work_confidential | remote | N/A | external | URLs | No monorepo connector writers |
| WST / browser capture | sibling `web-state-devtools`, AIOS browser tools | Tooling / Capture | Extension | Agents / Finance | Ephemeral capture | mixed | varies | local bridge | N/A | ephemeral | page URL | Finance harvest ≠ Work; CaptureEnvelope unwired to Work |
| Finance extension | `apps/finance/extension` | Money | Extension RPCs | Finance | Money capture | personal | sensitive | remote | N/A | money | Finance | Not Work |
| MCP Planner tools | `apps/planner/.../mcp*` | Plan | `add_task` etc. | AIOS fleet | Plan writes | personal | personal | remote | N/A | N/A | Planner | No Work MCP |
| Kenos CaptureEnvelope | `packages/contracts` | Platform | tests only | parity | Frozen contract | varies | varies | N/A | N/A | N/A | optional URL | No Work inbox runtime |
| Phase 1/2 Kenos | contracts, review SQL, AIOS read adapters | Platform + Plan + System | review/disposable | guards/UI | Foundation | mixed | mixed | disposable | N/A | N/A | AIOS routes | Reuse; do not redo |

## Naming collisions (must not collapse)

1. **Plan project** vs **Work Project** — Plan projects group personal tasks; Work Projects own professional deliverables/meetings/decisions. Link via EntityRef only if product later requires it.
2. **Home project** — spatial/household; never Work.
3. **Approval decision** vs **Work Decision** — policy vs product decision.
4. **Activity** — Kenos Activity audit vs `life_events` compat feed.
5. **Capture** — Kenos CaptureEnvelope vs Finance/WST harvest.

## Host for Work UI

Prefer **`apps/aios`** strangler host (Phase 2 Today/Inbox/Approvals/Activity already present). Do **not** create a new OS app without registry need. Portal remains launcher only. Planner remains Plan owner surface.

## Connector registry (proposal only)

Read-only inventory fields for Phase 3 fixtures/docs: `connectorId`, `sourceType`, `permissions`, `readWriteCapability`, `freshness`, `authenticationStatus`, `classification`, `supportedCaptureTypes`, `deepLink`, `owner`, `failureState`. Runtime auto-write remains prohibited.

## OPEN / temporary policy notes

- `OPEN-002` remains PENDING for Work body mirroring / personal-cloud model use.
- Phase 3 foundation stores **safe summaries + refs** under `work_confidential` classification in review-only / local simulation stores; full transcripts/tokens/secrets fail closed.
- WorkActionProposal is **not** a Task; conversion requires explicit user review and Plan `plan.create_task` Action boundary.
- Production migration apply, Executor, automatic Connector→canonical Work writes, and Plan Task owner changes remain Red/Yellow gates.
