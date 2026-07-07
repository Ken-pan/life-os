import { useEffect } from 'react'
import { syncPortraitLockEnabled } from '@life-os/theme'

export function PortraitGate({
  enabled = true,
  title,
  hint,
  ariaLabel,
}: {
  enabled?: boolean
  title: string
  hint: string
  ariaLabel?: string
}) {
  useEffect(() => {
    syncPortraitLockEnabled(enabled)
    return () => syncPortraitLockEnabled(false)
  }, [enabled])

  return (
    <div
      className="life-os-portrait-gate"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || title}
    >
      <div className="life-os-portrait-gate-inner">
        <span className="life-os-portrait-gate-icon" aria-hidden="true">
          ↻
        </span>
        <p className="life-os-portrait-gate-title">{title}</p>
        <p className="life-os-portrait-gate-hint">{hint}</p>
      </div>
    </div>
  )
}
