# Card primitive (`@life-os/platform-web/svelte/card`)

Token-driven layout primitive. No app coupling.

## Composition

| Subcomponent | Role |
| --- | --- |
| `Card` | Root container |
| `CardHeader` / `CardTitle` / `CardDescription` | Header stack |
| `CardContent` | Body |
| `CardFooter` | Footer row |
| `CardMedia` | Media slot |
| `CardActions` | Action buttons/links (non-interactive Card only) |

## `as` and `interactive`

| Case | Behavior |
| --- | --- |
| `interactive={false}` | `as` controls the root element: `article` (default), `section`, or `div`. |
| `interactive={true}` | Root always renders as `<button type="button">`. The `as` prop is **ignored**. |
| `disabled` on interactive Card | Native `disabled` on the button. |
| `disabled` on non-interactive Card | **Visual-only** (`opacity`, `pointer-events: none`). Not a native disabled state. |

## Interactive Card rules

**Do not nest interactive descendants inside an interactive Card.**

| Pattern | Allowed |
| --- | --- |
| Whole-card click | `<Card interactive>` — content only; **no** `CardActions`, buttons, links, or form controls inside. |
| Multiple actions | `<Card>` (non-interactive) + `<CardActions>` with buttons/links. |
| Complex business cards | Compose in app code; do not add app-specific variants here. |

`CardActions` logs a dev warning when placed inside an interactive Card.

## Variants and density

- **variant:** `surface` | `elevated` | `subtle` | `ghost`
- **density:** `compact` | `comfortable`
- **selected:** visual selection state; use with `interactive` for toggle-like cards.
