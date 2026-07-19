/**
 * @life-os/contracts — cross-surface product contracts.
 */
export type {
  AmbientThemeSource,
  BrandThemeID,
  ColorSchemePreference,
  ThemePreferenceModel,
} from './appearance'
export type { PageMetadata } from './meta'
export type {
  NavGroupModel,
  NavItemModel,
  NavPresentation,
  SegControlModel,
  SegOption,
} from './nav'
export type {
  EmptyStateModel,
  InsightSection,
  RecommendationDisplay,
  UserAction,
  UserActionIntent,
} from './content'
export type { SyncErrorPresentation, SyncState } from './sync'
export type { FeedbackMessage, OverlayKind, OverlayState } from './feedback'
export type {
  KenosActionDecision,
  KenosActionRequest,
  KenosActionResult,
  KenosActivityRecord,
  KenosApprovalState,
  KenosCaptureEnvelope,
  KenosClassification,
  KenosDomain,
  KenosEntityRef,
  KenosErrorClass,
  KenosOutboxRecord,
  KenosOutboxStatus,
  KenosRiskLevel,
  KenosSecurityDomain,
} from './kenos'
