/**
 * Re-export — canonical implementation lives in @life-os/platform-web
 * so Kenos Today / Assistant can share the same State Engine + readiness stripper.
 */
export {
  DIMENSION_ORDER,
  healthDaysToSleepObs,
  recentSleeps,
  metricSeries,
  trendSummary,
  recommendPolicy,
  todayTrainingLedger,
  trainingRecommendation,
  activityLevel,
  deriveState,
} from '@life-os/platform-web/kenos-health-state-engine'
