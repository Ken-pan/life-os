# Life OS — Input & IME Guideline

Chinese / Japanese / Korean (CJK) input uses an **Input Method Editor (IME)**. During composition, the browser fires `compositionstart` → `compositionupdate` → `compositionend` around the final committed text. Life OS inputs must not treat intermediate pinyin or candidate selection as finished input.

**Shared utility:** `@life-os/theme` → `createImeGuard()`

```js
import { createImeGuard } from '@life-os/theme';

const ime = createImeGuard();
```

---

## When to apply

Any input where **Enter submits**, **debounced search/API** runs on `input`, or **URL / route** updates from typing:

| Pattern | Risk without guard |
|---------|-------------------|
| Search / typeahead | Partial pinyin triggers API or `/search?q=zhoujie` |
| Chat / comment Enter | Enter confirms IME candidate but also sends message |
| Form Enter-to-save | Enter selects kanji/hanzi and saves draft |

Apply to `<input>`, `<textarea>`, and contenteditable surfaces that accept CJK text.

---

## `createImeGuard` contract

### Priority (inside `isComposing(event)`)

1. Self-maintained `composing` flag (set on `compositionstart`)
2. `event.isComposing` when present
3. `keyCode === 229` (`VK_PROCESS`) — deprecated but still useful at IME boundaries ([MDN keydown + IME](https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event))

### Safari / WebKit

Event order on IME confirm Enter can be:

```text
compositionend → keydown (isComposing === false)
```

**Do not** clear the guard synchronously in `compositionend`. Always defer:

```js
clearTimer = setTimeout(() => { composing = false; }, 0);
```

You may call `onCommit(value)` in `compositionend` **before** that timer; only the **flag clear** must be deferred.

---

## Standard wiring (Svelte)

Use controlled `value` + explicit handlers (avoid `bind:value` driving side effects during composition).

```svelte
<script>
  import { createImeGuard } from '@life-os/theme';

  const ime = createImeGuard();

  function onInput(e) {
    const value = e.currentTarget.value;
    localDraft = value; // optional: always mirror visible text

    if (ime.isComposing(e)) return;
    runSideEffects(value); // search, validate, etc.
  }

  function onCompositionEnd(e) {
    ime.compositionend(e, (value) => {
      runSideEffects(value);
    });
  }

  function onKeydown(e) {
    if (e.key !== 'Enter') return;
    if (ime.isComposing(e)) return; // do not preventDefault — let IME handle
    e.preventDefault();
    submit();
  }
</script>

<input
  value={localDraft}
  oninput={onInput}
  oncompositionstart={ime.compositionstart}
  oncompositionend={onCompositionEnd}
  oncompositioncancel={ime.compositioncancel}
  onkeydown={onKeydown}
/>
```

### Rules

| Event | Do | Don't |
|-------|-----|--------|
| `input` | Update visible draft; skip API / URL / submit while composing | Call `goto()`, close overlays, or overwrite `value` mid-composition |
| `compositionend` | Commit once via `onCommit`; defer clearing guard | Set `composing = false` synchronously before the next `keydown` |
| `Enter` | Return early when `ime.isComposing(e)` | Rely on `!e.isComposing` alone |
| `blur` | Skip dismiss if `ime.isComposing()` (no event) | Close dropdown/modal during active composition |

---

## Music OS reference implementations

| Surface | File | Side effect deferred |
|---------|------|----------------------|
| App bar typeahead | `apps/music/src/lib/components/GlobalSearch.svelte` | `fetchSuggestions`, Enter → full search |
| Search page (mobile toolbar) | `apps/music/src/routes/search/+page.svelte` | `setSearchQuery` → URL + `runFullSearch` |

Planner task title: `apps/planner/src/lib/components/TaskEditorSheet.svelte` (Enter-to-save).

### Planner Capture（`PLNR.CAPTURE.0`）

规范：[`planner-task-capture-spec.md`](./planner-task-capture-spec.md)

| 表面 | 文件 | IME guard | Enter / 副作用 | 状态 |
| ---- | ---- | --------- | -------------- | ---- |
| TaskEditorSheet 标题 | `TaskEditorSheet.svelte` | ✅ | Enter → 保存 | 已覆盖 |
| QuickAddBar 输入 | `QuickAddBar.svelte` | ✅ | Enter → 创建 | composition 期间 submit fail-closed |
| `@项目` 补全 | `taskCapture.js` · `ProjectPicker.svelte` | ✅ | Enter 先选项目；无菜单才创建 | mobile + desktop E2E |

`@` 触发与 `atQuery` 推导在 composition 期间返回 `null`；QuickAdd 的 `submit()` 也再次检查 guard，避免 Safari 选词 Enter 落入表单提交。

---

## QA checklist

Automated: `apps/music/scripts/ime-audit.mjs` (Playwright, composition event simulation).

Manual (Chrome + Safari, system CJK IME):

- [ ] Type pinyin for a query; **no** navigation or full results until candidate confirmed
- [ ] Enter to **select IME candidate** does not submit search / send message / save form
- [ ] Enter **after** composition commits intentional action (search, save)
- [ ] No typeahead loading flicker while typing pinyin letters

```bash
cd apps/music
npm run preview -- --port 5196 --host 127.0.0.1
IME_AUDIT_BASE=http://127.0.0.1:5196 node scripts/ime-audit.mjs
```

---

## Adding guard to a new input

1. Import `createImeGuard` from `@life-os/theme`.
2. Split **draft update** (always) from **side effects** (only when `!ime.isComposing(e)`).
3. Wire `compositionstart` / `compositionend` on the element.
4. Guard `Enter` and any shortcut keys that conflict with IME.
5. Add a row to the QA checklist above if the surface is user-facing search or submit.
