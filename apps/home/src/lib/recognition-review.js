/**
 * 跨扫描认亲「证据式确认」的 IO 层(P3)。
 *
 * Mac 端 matcher(`scripts/vision/match_objects.py`)把**够像但不够确信**的难例写进
 * `home.object_observations` 的 `match.state = possibly_same`:不自动合并,交给用户看图裁决。
 * 这里:拉难例 → 给候选历史身份配一张代表旧图 → 批量签名裁剪 → 组装成证据卡片;
 * 用户「是同一件 / 不是 / 暂不确定」回写 `match` + `canonical_object_id`。
 *
 * ⚠️ 结构现实:权威副本 server-optimized 零照片 → 零 embedding,故这套认亲是**设备扫描
 * 之间**的身份图,不走 `scan-identity.js`(那条是 scan-vs-权威、纯几何)。两条并行。
 * 见 `docs/object-recognition-roadmap.md` P3 节。
 *
 * ⚠️ 裁决的持久性:matcher `--apply` 会重算整张表。为了不把用户裁决冲掉,裁决落进
 * `match.userDecision`,matcher 侧对带 userDecision 的行**原样保留**(见 match_objects.py)。
 */
import { supabase } from './supabase.js'

const BUCKET = 'home-scan-photos'
const SIGNED_URL_TTL_S = 3600
/**
 * 一次最多交给用户几张证据卡片。战略:「只把 ≤3–5 个有充分证据的难例交给用户」——
 * 别把整个历史里的所有歧义一次性倒给人。按候选相似度降序取前 N(最像的 = 最可能真同一件
 * = 一个「是」就收编,最值得先确认);其余留库,这批处理完 reload 会浮出下一批。
 */
const MAX_REVIEWS = 5

/**
 * @typedef {object} RecognitionReview 一张待确认的证据卡片
 * @property {string} scanId
 * @property {string} observationId
 * @property {string} [kind]
 * @property {string} [label]
 * @property {number} observedAt
 * @property {string} [newCropUrl] 这次扫描该件的裁剪(签名 URL,1h)
 * @property {{ canonicalId?: string, label?: string, score?: number, oldCropUrl?: string }} candidate 最像的历史身份
 */

/**
 * @typedef {object} RecognitionReviewBatch
 * @property {RecognitionReview[]} items 本批交给用户的卡片(≤ MAX_REVIEWS,按相似度降序)
 * @property {number} total 全部待确认难例数(可能远多于本批 —— 横幅露总数用)
 */

/**
 * 拉 `possibly_same` 难例,组装成证据卡片(含签名裁剪 URL)。本批只给前 MAX_REVIEWS 张,
 * 但同时返回总数 total(横幅显示「本批 5 · 共 21」用)。只读。未登录 / RLS 拦下 / 无难例 → 空批。
 * @returns {Promise<RecognitionReviewBatch>}
 */
export async function loadRecognitionReviews() {
  // 1) 难例行(possibly_same)。新→旧,让最近扫描的难例排前面。
  const { data: pending, error } = await supabase
    .schema('home')
    .from('object_observations')
    .select('scan_id, observation_id, kind, label, photo_paths, observed_at, match')
    .filter('match->>state', 'eq', 'possibly_same')
    .order('observed_at', { ascending: false })
  if (error) throw new Error(`拉取认亲难例失败:${error.message}`)
  const rows = pending ?? []
  if (!rows.length) return { items: [], total: 0 }

  // 2) 候选历史身份 → 代表旧图:按 canonical_object_id 取**最早**一次带裁剪的观察
  //    (最早那次通常是播种该身份的扫描,图最干净)。
  const wantedCanon = [
    ...new Set(rows.map((r) => topCandidate(r)?.canonicalId).filter(Boolean)),
  ]
  /** @type {Map<string, { label?: string, path: string }>} */
  const repByCanon = new Map()
  if (wantedCanon.length) {
    const { data: gallery } = await supabase
      .schema('home')
      .from('object_observations')
      .select('canonical_object_id, label, photo_paths, observed_at')
      .in('canonical_object_id', wantedCanon)
      .order('observed_at', { ascending: true })
    for (const g of gallery ?? []) {
      const c = g.canonical_object_id
      if (c && !repByCanon.has(c) && g.photo_paths?.length) {
        repByCanon.set(c, { label: g.label, path: g.photo_paths[0] })
      }
    }
  }

  // 3) 批量签名所有需要的裁剪路径(新图 + 候选旧图),一次请求。
  const paths = new Set()
  for (const r of rows) {
    if (r.photo_paths?.[0]) paths.add(r.photo_paths[0])
    const rep = repByCanon.get(topCandidate(r)?.canonicalId)
    if (rep?.path) paths.add(rep.path)
  }
  const signed = await signPaths([...paths])

  // 4) 组装卡片 → 按候选相似度降序 → 只取前 MAX_REVIEWS(见常量注释)
  const cards = rows.map((r) => {
    const c0 = topCandidate(r) ?? {}
    const rep = c0.canonicalId ? repByCanon.get(c0.canonicalId) : null
    return {
      scanId: r.scan_id,
      observationId: r.observation_id,
      kind: r.kind ?? undefined,
      label: r.label ?? undefined,
      observedAt: r.observed_at,
      newCropUrl: r.photo_paths?.[0] ? signed.get(r.photo_paths[0]) : undefined,
      candidate: {
        canonicalId: c0.canonicalId,
        label: c0.label ?? rep?.label,
        score: c0.score,
        oldCropUrl: rep?.path ? signed.get(rep.path) : undefined,
      },
    }
  })
  cards.sort((a, b) => (b.candidate.score ?? 0) - (a.candidate.score ?? 0))
  return { items: cards.slice(0, MAX_REVIEWS), total: cards.length }
}

/** @param {any} row object_observations 行 → 分最高的候选(matcher 已按分降序) */
function topCandidate(row) {
  return row?.match?.candidates?.[0]
}

/**
 * 批量签名裁剪路径 → `Map<path, signedUrl>`。整批失败静默返回空 Map
 * (卡片降级为无图:文字/尺寸/分数照常展示)。
 * @param {string[]} paths
 */
async function signPaths(paths) {
  /** @type {Map<string, string>} */
  const out = new Map()
  if (!paths.length) return out
  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_S)
    if (error) throw error
    for (const row of data ?? []) {
      if (row?.signedUrl && row.path) out.set(row.path, row.signedUrl)
    }
  } catch {
    /* 无图降级 */
  }
  return out
}

/**
 * @typedef {'same'|'different'|'unsure'} RecognitionDecision
 * `same` 确认同一件(并进候选身份)· `different` 不是(保持独立)· `unsure` 暂不确定(压下不再问)
 */

/**
 * 回写用户对一张证据卡片的裁决(只改这一行的 `match` + `canonical_object_id`)。
 * 先读现行 `match` 做保守合并 —— 别丢 candidates/score 等回放证据。
 * @param {RecognitionReview} review
 * @param {RecognitionDecision} decision
 */
export async function resolveRecognition(review, decision) {
  const { data: cur, error: readErr } = await supabase
    .schema('home')
    .from('object_observations')
    .select('canonical_object_id, match')
    .eq('scan_id', review.scanId)
    .eq('observation_id', review.observationId)
    .single()
  if (readErr) throw new Error(`读取难例失败:${readErr.message}`)

  const oldCanonical = cur?.canonical_object_id
  const candId = review.candidate?.canonicalId
  const match = { ...(cur?.match ?? {}) }
  match.userDecision = decision // ← matcher 见此字段即原样保留,不再重算这行
  match.decidedAt = Date.now()
  let canonicalObjectId = oldCanonical

  if (decision === 'same' && candId) {
    match.state = 'same'
    match.chosenCanonicalId = candId
    canonicalObjectId = candId // 并进候选历史身份
  } else if (decision === 'different') {
    match.state = 'added' // 保持自己的独立身份(canonical 不变)
    match.rejectedCanonicalId = candId ?? null
    match.chosenCanonicalId = null
  } else {
    match.state = 'deferred' // 暂不确定:移出复核队列,候选证据留档
  }

  const { error } = await supabase
    .schema('home')
    .from('object_observations')
    .update({ canonical_object_id: canonicalObjectId, match })
    .eq('scan_id', review.scanId)
    .eq('observation_id', review.observationId)
  if (error) throw new Error(`保存裁决失败:${error.message}`)

  // group-merge:确认「是同一件」时,把**原身份下的其它历史观察**一起并进候选身份。
  // 这件难例可能是某 canonical 的种子、底下还挂着别的扫描的观察(它们被 matcher
  // 自动认作同一件);只搬这一行会把一条身份线劈成两半、留碎片。整组一起搬才干净。
  if (decision === 'same' && candId && oldCanonical && oldCanonical !== candId) {
    await mergeCanonicalSiblings(oldCanonical, candId, review)
  }
}

/**
 * 把 `fromCanonical` 名下(除已确认那行外)的其它观察全部改指 `toCanonical`。
 * 兄弟行随主确认一起打 userDecision 锁(标 `viaGroupMerge` 溯源),免得下次
 * matcher `--apply` 把它们重算回旧身份。它们与被确认行本就被 matcher 认作同一件
 * (共享 fromCanonical),用户确认其一即确认整组,传递成立。
 * @param {string} fromCanonical
 * @param {string} toCanonical
 * @param {RecognitionReview} confirmed
 */
async function mergeCanonicalSiblings(fromCanonical, toCanonical, confirmed) {
  const { data: sibs, error } = await supabase
    .schema('home')
    .from('object_observations')
    .select('scan_id, observation_id, match')
    .eq('canonical_object_id', fromCanonical)
  if (error || !sibs?.length) return
  const now = Date.now()
  for (const s of sibs) {
    if (s.scan_id === confirmed.scanId && s.observation_id === confirmed.observationId) continue
    const m = { ...(s.match ?? {}) }
    m.state = 'same'
    m.chosenCanonicalId = toCanonical
    m.userDecision = 'same'
    m.viaGroupMerge = fromCanonical // 溯源:随身份合并带过来,非逐个人工看过
    m.decidedAt = now
    await supabase
      .schema('home')
      .from('object_observations')
      .update({ canonical_object_id: toCanonical, match: m })
      .eq('scan_id', s.scan_id)
      .eq('observation_id', s.observation_id)
  }
}
