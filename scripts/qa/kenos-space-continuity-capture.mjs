#!/usr/bin/env node
/**
 * Space Continuity evidence capture (Playwright).
 * Proves descriptor → deep-link restore for Planner + Fitness + account isolation.
 *
 * Usage:
 *   node scripts/qa/kenos-space-continuity-capture.mjs
 *
 * Env:
 *   KENOS_URL   default http://127.0.0.1:5291
 *   PLANNER_URL default http://127.0.0.1:5188 (or theme planner preview)
 *   FITNESS_URL default http://127.0.0.1:5189
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildResumeDescriptor,
  encodeResumeHandoff,
  resumeDescriptorToOpenUrl,
  isResumeExpired,
  fallbackResumeToHome,
} from '../../packages/platform-web/src/kenosSpaceContinuity.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(
  __dirname,
  '../../docs/qa/evidence/kenos-space-continuity-2026-07-20',
)
mkdirSync(outDir, { recursive: true })

const KENOS = process.env.KENOS_URL || 'http://127.0.0.1:5291'
const PLANNER = process.env.PLANNER_URL || 'http://127.0.0.1:5188'
const FITNESS = process.env.FITNESS_URL || 'http://127.0.0.1:5174'

const plannerDescriptor = buildResumeDescriptor({
  userId: 'continuity-user-a',
  spaceId: 'plan',
  route: `${PLANNER}/upcoming`,
  entityId: 'demo-overdue-task',
  displayTitle: 'Plan',
  displaySubtitle: 'Upcoming · Overdue · 测试任务',
  substate: { filter: 'overdue', detailOpen: true, progress: '任务详情已打开' },
})

const fitnessDescriptor = buildResumeDescriptor({
  userId: 'continuity-user-a',
  spaceId: 'training',
  route: `${FITNESS}/day/chest/focus`,
  entityId: 'c_fly',
  displayTitle: 'Training',
  displaySubtitle: 'Cable fly · Set 2 of 4',
  substate: {
    dayId: 'chest',
    exerciseId: 'c_fly',
    set: 2,
    progress: 'Set 2 of 4',
  },
})

const plannerOpen = resumeDescriptorToOpenUrl(plannerDescriptor)
const fitnessOpen = resumeDescriptorToOpenUrl(fitnessDescriptor)
const handoff = `${KENOS}/?kenosDemo=1&kenosResume=${encodeResumeHandoff(fitnessDescriptor)}&openContinue=1`

const expired = buildResumeDescriptor({
  userId: 'continuity-user-a',
  spaceId: 'training',
  route: fitnessOpen,
  displayTitle: 'Training',
  displaySubtitle: 'Cable fly · Set 2 of 4',
  updatedAt: Date.now() - 60_000,
  expiresAt: Date.now() - 1_000,
})
const expiredFallback = fallbackResumeToHome(expired, `${FITNESS}/`)

const manifest = {
  capturedAt: new Date().toISOString(),
  status: {
    contract: 'IMPLEMENTED',
    planner: 'PARTIAL',
    fitness: 'PARTIAL',
    accountIsolation: 'PARTIAL',
    domainExperienceLiveE2E: 'NOT_YET_VALIDATED',
    note: 'This script only proves descriptor→URL strings. Do not stamp VALIDATED without live Planner+Fitness Continuity screenshots.',
  },
  flows: {
    A_fitness_to_planner_to_fitness: {
      suspend: fitnessDescriptor,
      openUrl: fitnessOpen,
      notes: 'Continue handoff encodes kenosEx=c_fly&kenosSet=2; FocusSession resumeFitnessFocus applies cursor',
    },
    B_planner_filter_task: {
      suspend: plannerDescriptor,
      openUrl: plannerOpen,
      notes: 'kenosFilter=overdue + kenosTask + kenosDetail=1 restores Upcoming filter + task sheet',
    },
    C_account_switch: {
      notes: 'bindSpaceSwitcherOwner / Apple bindOwner clear resume map; domainContinueStorageKey is user-namespaced',
    },
  },
  urls: {
    kenosContinueHandoff: handoff,
    plannerOpen,
    fitnessOpen,
    expiredFallback: expiredFallback.route,
    expiredKeptSubtitle: expiredFallback.displaySubtitle,
  },
  assertions: {
    plannerHasTaskQuery: /kenosTask=demo-overdue-task/.test(plannerOpen),
    plannerHasOverdueFilter: /kenosFilter=overdue/.test(plannerOpen),
    fitnessHasEx: /kenosEx=c_fly/.test(fitnessOpen),
    fitnessHasSet: /kenosSet=2/.test(fitnessOpen),
    expiredIsExpired: isResumeExpired(expired),
    expiredFallsHome: expiredFallback.route === `${FITNESS}/`,
  },
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
writeFileSync(
  join(outDir, 'README.md'),
  `# Kenos Space Continuity — evidence (2026-07-20)

## Automated descriptor proofs

See \`manifest.json\` assertions (all must be true).

| Flow | Open URL contains |
| ---- | ----------------- |
| Planner filtered task | \`kenosFilter=overdue\`, \`kenosTask=\`, \`kenosDetail=1\` |
| Fitness active set | \`kenosEx=c_fly\`, \`kenosSet=2\` |
| Expired | fallback home; subtitle kept |

## Manual / Playwright frame checklist

When previews are up:

1. **A** Fitness Active (\`/day/chest/focus?kenosEx=c_fly\`) → Continue → Kenos → Planner → Continue → Fitness same ex
2. **B** Planner \`/upcoming?kenosFilter=overdue&kenosTask=…&kenosDetail=1\` → Continue → Assistant/Inbox → Continue → same filter/task
3. **C** Logout → other account → empty Continue resume

Honest stamps: CONTRACT IMPLEMENTED; Planner/Fitness/Account PARTIAL; live Flow A/B NOT_YET_VALIDATED.
Do not claim VALIDATED or READY_FOR_OWNER_REVIEW from this script alone.
`,
)

console.log(JSON.stringify(manifest.assertions, null, 2))
console.log('wrote', outDir)
