import type { UserAction } from './content'

/** cross-surface feedback / toast / banner model. */
export type FeedbackMessage = {
  id: string
  body: string
  severity?: 'info' | 'success' | 'warning' | 'error'
  /** Presentation hint only; platform policy may clamp or ignore it. */
  durationMs?: number
  action?: UserAction
}

export type OverlayKind = 'modal' | 'sheet' | 'drawer' | 'popover'

/** cross-surface overlay state, without DOM lifecycle details. */
export type OverlayState = {
  kind: OverlayKind
  open: boolean
}
