/**
 * Independent legacy shadow fixtures for cutover evidence.
 * These MUST NOT be copies of the Kenos Assistant projection arrays.
 */

export const SHADOW_SOURCE = {
  legacyPortalPending: 'legacy.portal_pending_fixture',
  legacyLifeEventsActivity: 'legacy.life_events_activity_fixture',
  kenosInboxProjection: 'kenos.assistant_inbox_projection',
  kenosActivityProjection: 'kenos.assistant_activity_projection',
  legacyPortalToday: 'legacy.portal_today_summary',
  kenosTodayProjection: 'kenos.assistant_today_projection',
}

/** Stable independent legacy Inbox sample (not derived from CONTROL.inbox). */
export function legacyPortalPendingShadowFixture() {
  return [
    {
      id: 'legacy-inbox-plan-1',
      ownerDomain: 'plan',
      status: 'open',
      freshness: 'fresh',
      deepLink: 'https://planner.kenos.space/inbox',
      classification: 'personal',
      sourceIdentity: SHADOW_SOURCE.legacyPortalPending,
    },
    {
      id: 'legacy-inbox-system-2',
      ownerDomain: 'system',
      status: 'open',
      freshness: 'stale',
      deepLink: null,
      classification: 'personal',
      sourceIdentity: SHADOW_SOURCE.legacyPortalPending,
    },
  ]
}

/** Stable independent legacy Activity sample (not derived from CONTROL.activities). */
export function legacyLifeEventsActivityShadowFixture() {
  return [
    {
      id: 'legacy-activity-1',
      ownerDomain: 'plan',
      status: 'succeeded',
      freshness: 'fresh',
      deepLink: 'https://planner.kenos.space/activity',
      classification: 'personal',
      sourceIdentity: SHADOW_SOURCE.legacyLifeEventsActivity,
    },
  ]
}

export function attachSourceIdentity(items, sourceIdentity) {
  return (items || []).map((item) => ({
    ...item,
    sourceIdentity,
  }))
}
