# Kenos sensory (haptic-first) — 2026-07-21

## Goal

Unify Continuity haptics so Plan / Training / Work / Money feel native inside the
iOS shell. Fix WKWebView dead zone where `navigator.vibrate` did nothing.

## Shipped

- `@life-os/platform-web/kenos-sensory` — semantic `sensory(intent)` with per-intent throttle
- Native bridge: cached generators, one-time warm, `pulse` = heavy → delayed medium
- Wired: Plan TaskRow / QuickAdd / TaskEditor, Training timer + FocusSession (+ session pulse),
  Work approvals + Composer send, Money txn save, Home tidy finish, all Space `compose()`,
  CaptureView success
- Training **audio** still gated by `settings.sound`; **haptics always fire** for rest cues

## Refine pass

- Decouple timer haptics from `settings.sound` (mute chimes ≠ mute Taptic)
- Native `pulse` style (no JS setTimeout for second hit)
- Intent throttle (`SENSORY_MIN_INTERVAL_MS`) to stop threshold spam
- Plan create/save + uncomplete soft; Training session-complete pulse; Tidy last-item pulse

## Device feel checklist

1. Dock tab change → selection tick
2. Space Shelf open/close threshold → soft impact
3. Plan swipe threshold → tick; complete (incl. reduce-motion path) → success; uncomplete → soft
4. Plan QuickAdd / new task editor save → success; edit save → commit
5. Training set → commit; last set / PR → success; session done → pulse; rest end → pulse + optional chime
6. Training with sound off → chime silent, warn/tick/pulse still feel
7. Approvals confirm → success; reject → warn
8. Home tidy item done → commit; last item → pulse
9. Capture Save draft → success
10. Settings → Sounds & Haptics → System Haptics Off → no vibration

## Tests

```bash
npm test -w @life-os/platform-web
```
