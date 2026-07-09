/**
 * M-P5: 验收 v6 推荐 RPC 是否读取 play_events 行为分（recently completed / replay）。
 *
 * Usage:
 *   cd apps/music && npm run qa:rec-behavior
 *
 * Requires: .env.local or VITE_SUPABASE_* + UI_QA_EMAIL/PASSWORD (see ia-qa-auth.mjs)
 */
import { createClient } from '@supabase/supabase-js'
import { createLifeOsSupabaseClient } from '../../../packages/sync/src/supabaseClient.js'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { loadMusicQaEnv, signInForMusicQa } from './ia-qa-auth.mjs'
import { ensureM5QaLibrary, M5_QA_TRACKS } from './seed-m5-qa-library.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

/** @type {{ step: string; ok: boolean; detail?: string }[]} */
const report = []

function log(step, ok, detail = '') {
  report.push({ step, ok, detail })
  const icon = ok ? 'PASS' : 'FAIL'
  console.log(`${icon} [${step}]${detail ? ` ${detail}` : ''}`)
}

async function main() {
  const env = loadMusicQaEnv(root)
  const session = await signInForMusicQa(env)
  const { supabase: sb } = createLifeOsSupabaseClient(createClient, {
    env: {
      VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
    },
    schema: 'music',
    productionFallback: false,
  })
  await sb.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })

  const { data: metaRows, error: metaErr } = await sb
    .from('music_track_meta')
    .select('track_id, title, artist')
    .limit(5)

  if (metaErr) throw metaErr

  let rows = metaRows ?? []
  if (!rows.length) {
    const seeded = await ensureM5QaLibrary(sb, session.user.id)
    log('seed-library', seeded.seeded > 0, `upserted ${seeded.seeded} M5 QA tracks`)
    const { data: afterSeed, error: afterSeedErr } = await sb
      .from('music_track_meta')
      .select('track_id, title, artist')
      .in(
        'track_id',
        M5_QA_TRACKS.map((t) => t.id),
      )
    if (afterSeedErr) throw afterSeedErr
    rows = afterSeed ?? []
  }

  if (!rows.length) {
    log(
      'seed-tracks',
      false,
      '无曲库且 M5 QA seed 失败 — 可设 MUSIC_QA_EMAIL 为有曲库账号',
    )
    console.log('\nM-P5 behavior smoke: SKIPPED (no library for QA user)')
    process.exit(0)
  }

  const seed =
    rows.find((row) => row.track_id === M5_QA_TRACKS[0].id) ?? rows[0]
  log('seed-tracks', true, `${seed.title} · ${seed.artist}`)

  const { data: beforeRows, error: beforeErr } = await sb.rpc('get_recommendations', {
    p_seed_track_id: seed.track_id,
    p_mode: 'same_vibe',
    p_limit: 12,
    p_exclude_track_ids: [],
  })
  if (beforeErr) throw beforeErr
  log('rpc-baseline', (beforeRows?.length ?? 0) > 0, `${beforeRows?.length ?? 0} picks`)

  const candidate =
    beforeRows?.find((row) => row.track_id && row.track_id !== seed.track_id) ?? null
  if (!candidate) {
    log('pick-candidate', false, '无推荐候选曲')
    process.exit(1)
  }
  log('pick-candidate', true, candidate.title)

  const beforeReasons = (candidate.reasons ?? []).join('; ')
  const beforeScore = Number(candidate.score) || 0

  const testEventId = crypto.randomUUID()
  const { error: insertErr } = await sb.from('play_events').insert({
    id: testEventId,
    user_id: session.user.id,
    track_id: candidate.track_id,
    event_type: 'complete',
    played_ratio: 0.95,
    context: 'qa_rec_behavior_m5',
  })
  if (insertErr) throw insertErr
  log('insert-complete', true, candidate.track_id)

  const { data: afterRows, error: afterErr } = await sb.rpc('get_recommendations', {
    p_seed_track_id: seed.track_id,
    p_mode: 'same_vibe',
    p_limit: 12,
    p_exclude_track_ids: [],
  })
  if (afterErr) throw afterErr

  const afterPick = afterRows?.find((row) => row.track_id === candidate.track_id) ?? null
  if (!afterPick) {
    log('behavior-reason', false, '完练后候选曲不在推荐列表中')
  } else {
    const afterReasons = (afterPick.reasons ?? []).filter(Boolean)
    const hasRecentComplete = afterReasons.some((r) =>
      String(r).toLowerCase().includes('recently completed'),
    )
    const scoreDelta = (Number(afterPick.score) || 0) - beforeScore
    const ok = hasRecentComplete || scoreDelta > 0.001
    log(
      'behavior-reason',
      ok,
      `reasons=[${afterReasons.join(', ')}] Δscore=${scoreDelta.toFixed(4)} (before: ${beforeReasons || '—'})`,
    )
  }

  await sb.from('play_events').delete().eq('id', testEventId)
  log('cleanup', true)

  const failed = report.filter((r) => !r.ok).length
  console.log(`\nM-P5 behavior smoke: ${report.length - failed}/${report.length} passed`)
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
