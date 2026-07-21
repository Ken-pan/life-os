# Kenos Shell Navigation v2 — Research Freeze

**Status:** `RESEARCH_FROZEN` + `FOUNDATION_SHIPPED_ON_DEVICE` (partial Phase A/B)
**Date:** 2026-07-21
**Evidence:** `docs/qa/evidence/kenos-ios-dogfood-2026-07/screenshots/nav-v2/VERIFY.md`
**Does not close Phase 4.** Does not claim Kenos shipped.

## TL;DR (frozen)

> **可以做「领域模式切换 + 单一动态底栏 + Space Shelf」，但不要把左边缘滑动设成全局唯一入口。**
> iPhone 上保留系统级返回手势；**只有领域根页面**左边缘拉动才打开 Shelf。
> 日常可见入口：底栏固定 **Kenos**、页面标题、全局搜索 / Quick Switch。

Ideal model:

```text
Kenos Mode          → 四个系统 Tab
Domain Mode         → 一套领域 Dock，完全替换 Kenos Tab Bar
Focus Mode          → Dock 暂时隐藏
```

---

## Relationship to Daily Beta IA

| Layer         | Status                           | Meaning                                                     |
| ------------- | -------------------------------- | ----------------------------------------------------------- |
| Daily Beta IA | **LOCKED** (Kenos Mode tabs)     | Today · Assistant · Spaces · Inbox in Kenos Mode            |
| Navigation v2 | **RESEARCH_FROZEN** + foundation | Mode switch + dock replace + Shelf; Owner ordered implement |
| Stabilization | **IN PROGRESS**                  | Dogfood continues; this IA landed by Owner order            |

---

## Research corrections (must keep)

### 1. Do not steal all leading-edge swipes

Apple: custom gestures are shortcuts, not replacements for visible controls; do not conflict with familiar system gestures ([HIG Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)).

```text
NavigationStack depth > 0  →  system Back
NavigationStack depth = 0  →  Space Shelf (optional edge pull)
+ always visible buttons
```

### 2. Dynamic tab bar only at mode boundaries

Apple: Tab Bar is top-level navigation; keep visible and stable; churning tabs confuse location ([HIG Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)).

Only replace when crossing **Kenos ↔ Domain ↔ Focus**. Inside one domain, dock slots stay stable.

### 3. Borrow Stage Manager _state_, not macOS chrome

Borrow: recent living contexts, restore-in-place, hideable shelf.
Do **not** borrow: persistent left thumbnails, multi-window, desktop grouping on iPhone.
iPhone Shelf = **overlay / sheet**, not mini Stage Manager ([Stage Manager](https://support.apple.com/guide/ipad/ipad1240f36f/ipados)).

---

## Three modes

### A. Kenos Mode — system hall

```text
Spaces chip + Today · Assistant · Inbox · Settings
```

### B. Domain Mode — work surface

Kenos Tab Bar **hands off** to Domain Dock. Exactly one bottom bar.

Leading chip is **Spaces** (Shelf). Capsule = 4 domain slots (≤5 chrome total).

| Domain   | 1      | 2      | 3        | 4        | More (sheet)                                        |
| -------- | ------ | ------ | -------- | -------- | --------------------------------------------------- |
| Plan     | Spaces | Tasks  | Calendar | Inbox    | Search · Upcoming · Projects · Completed · Insights |
| Training | Spaces | Today  | Workout  | History  | Program · Library · Discover · Stats · Tools        |
| Money    | Spaces | Today  | History  | Accounts | Forecast · Stocks · Decision · Review · Settings    |
| Library  | Spaces | Inbox  | Library  | Recall   | Projects · Timeline · Overview · Settings           |
| Music    | Spaces | Home   | Search   | Library  | Playlists · Liked · Browse · Import · Settings      |
| Home     | Spaces | 平面   | 储藏     | 整理     | Settings                                            |
| Health   | Spaces | Status | Focus    | Trends   | Settings                                            |
| Work     | Spaces | Today  | Focus    | Inbox    | Assistant · Spaces · Settings                       |

| Slot | Permanent meaning                                |
| ---- | ------------------------------------------------ |
| 1    | Spaces chip (Shelf; leave Domain via shelf row)  |
| 2–4  | Domain primary destinations                      |
| More | Secondary routes (not a 5th fantasy destination) |

**Kenos slot:**

| Action              | Result                          |
| ------------------- | ------------------------------- |
| Tap                 | Return prior Kenos tab + scroll |
| Long-press          | Open Space Shelf                |
| Optional double-tap | Jump Today root                 |

### C. Focus Mode — immersive

Active workout, Deep Work, scan, capture, long edit: **hide** dock. Clear exit only. Aligns with Live Activities “bounded task” guidance ([HIG Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)).

---

## Space Shelf

Not an App Switcher — living **domain environments** inside one Kenos product.

### Four blocks

1. **Kenos Home** — system exit (Today summary), not a normal space
2. **Active** — truly running (Training, Focus, music, scan, record)
3. **Recent** — restore context (entity, page, time, draft hint)
4. **All Spaces** — full catalog (may cold-open domain home)

### Four entry points

| Entry                                   | Behavior                                |
| --------------------------------------- | --------------------------------------- |
| **A** Left-edge at domain **root** only | Power-user Shelf pull                   |
| **B** Long-press dock Kenos             | Discoverable Shelf                      |
| **C** Tap domain title (`Plan ˅`)       | **Light Quick Switch** (not full Shelf) |
| **D** Global Search / Quick Switch      | Name → destination                      |

### Left-edge decision tree

```text
leading-edge drag
├─ Sheet / Modal open          → no Shelf
├─ Focus Mode                  → no Shelf (explicit Exit)
├─ NavigationStack depth > 0   → system interactive Back
├─ WebView canGoBack           → Web/router Back first
├─ Horizontal editor gesture   → no Shelf
└─ Domain Root                 → Space Shelf
```

Gesture thresholds are **device-tuning**, not product contracts (~16–22pt edge, ~28–34% width commit, etc.). Prefer `UIScreenEdgePanGestureRecognizer` coordinated with `interactivePopGestureRecognizer`.

---

## Affordance matrix (do not merge UIs)

| Capability     | User intent          | UI                  |
| -------------- | -------------------- | ------------------- |
| Live Accessory | Something is running | Thin bar above dock |
| Continue       | Resume recent work   | Recent sheet        |
| Space Shelf    | Visual domain switch | State-card overlay  |
| Quick Switch   | I know the name      | Search panel        |
| Spaces         | Browse full catalog  | Formal page         |

Share: Destination Router · Recent Context Store · Domain Registry · Live State Store.
Do **not** merge into one mega-panel.

---

## Domain Navigation Manifest (architecture)

> Domains **must not** paint their own physical BottomNav. They declare capability; **Kenos Shell** renders the only Dock.

```ts
type DomainNavigationManifest = {
  domainId: 'plan' | 'training' | string
  version: 1
  tabs: Array<{
    id: string
    label: string
    icon: string
    destination: string
  }>
}
```

Shell prepends fixed Kenos slot. Web domains enter `embedded-shell` / `iosNativeShell` and hide legacy BottomNav, duplicate headers, old switchers. Bridge reports: `activeTab`, `canGoBack`, `currentEntity`, `title`, `liveState`, `unsavedDraft`.

External legacy apps: system handoff only — never pretend in-shell Domain Mode.

---

## State to persist (semantic, not bitmaps)

```text
domainId · selectedDomainTab · navigationPath · focusedEntityId
presentationMode · scrollAnchor · draftReference
lastActiveAt · liveActivityReference · returnContext
```

Avoid long-term: full bitmaps, secrets in previews, full body copies, opaque WK session dumps.

**Privacy levels for Shelf cards:** Full / Private / Hidden (auto-downgrade on lock / Screen Mirroring / background snapshot).

---

## iPad / a11y / motion

- **iPhone:** overlay Shelf
- **iPad wide:** Sidebar (Active / Recent / All), not hidden edge-only ([HIG Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars))
- a11y: buttons, VoiceOver, Switch/Voice Control, Reduce Motion, Dynamic Type, glyphs+text
- Suggested shortcuts: `⌘1–4` Kenos tabs · `⌘⇧S` Shelf · `⌘K` Quick Switch · `⌘[` Back
- Mode transition ~220–280ms; Reduce Motion = crossfade only

---

## Frozen 12 rules

1. Entire screen has **exactly one** bottom bar.
2. Bottom bar replaces only on **Kenos ↔ Domain ↔ Focus** mode change.
3. Slot 1 is always **Kenos**.
4. Inside a domain, slot **semantics and order** stay stable.
5. **Navigation Back always beats** Space Shelf.
6. Shelf edge-pull **only** at domain root.
7. Gesture is **never** the only entry.
8. Only **Focus Mode** hides all navigation.
9. Domains emit **Navigation Manifest**; no second physical bottom nav.
10. Shelf restores **semantic** state, not real window processes.
11. Sensitive domains support **privacy previews**.
12. iPad wide uses **Sidebar**, not hidden Shelf alone.

---

## Phased delivery

| Phase | Scope                                                                                                    | Est.  | Status (2026-07-21)                                                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A** | `NavigationMode` + Manifest stub + Shell single Dock + Plan/Training + hide web BottomNav + Kenos return | 1–2d  | **Mostly done** — dock replace + return + Plan/Training web BottomNav hide shipped; Manifest/bridge still open                                               |
| **B** | Shelf MVP: Kenos/Active/Recent/All + restore + long-press Kenos + title→Quick Switch + root edge         | 2–4d  | **Mostly done** — Shelf + long-press + root edge + title→Quick Switch; Active block / VoiceOver polish open                                                  |
| **C** | Per-domain NavigationPath, scroll/draft, transition, Reduce Motion, privacy                              | 2–5d  | Open                                                                                                                                                         |
| **D** | Live Activities, Spotlight, Shortcuts, Handoff, iPad/Mac Sidebar                                         | later | **Partial** — Live Activity hooks + App Intents/Shortcuts + local notifs + Spotlight/`NSUserActivity`; ActivityKit/APNs/Widget embed/iPad Sidebar still open |

### Phase A acceptance

```text
无双底栏（原生 Dock 唯一；web BottomNav 在 embedded 隐藏）
Plan / Training 可完整导航
返回 Kenos 恢复原位置
```

### Phase B acceptance

```text
Back 不冲突
所有领域 ≤2 taps 可达
状态可恢复
VoiceOver 有入口
标题 → Quick Switch；长按 Kenos / 根页左缘 → Shelf
```

---

## Shipped vs remaining (honest)

| Item                                                 | State                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| Three modes + Domain dock replace (Plan/Training)    | Shipped on device                                              |
| Kenos slot tap return + long-press Shelf             | Shipped                                                        |
| Left-edge Shelf only when `!webCanGoBack`            | Shipped                                                        |
| Space Shelf overlay (System / Recent / All)          | Shipped (Active block still thin)                              |
| Title → full Shelf                                   | Fixed → title opens **Quick Switch**                           |
| Plan/Training web BottomNav hide in `iosNativeShell` | **Shipped** (helper + layout CSS; shots `06`/`07`)             |
| Domain Navigation Manifest + bridge                  | **Shipped** — all Continuity domains publish via `kenosNative` |
| Privacy levels / iPad Sidebar / Phase C–D            | Open                                                           |

---

## Final judgment

Direction is correct: **Shell-owned single dynamic Dock + root-only Shelf + Back first + visible Kenos/title/search entries.**
Highest leverage next work remains **Phase A residual**: Manifest + hide domain web BottomNav — so dual chrome disappears by architecture, not CSS luck alone.
