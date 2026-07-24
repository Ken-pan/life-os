/**
 * Leo 现成静帧（apps/aios/static/leo/scenes/）— 零等待在场感。
 * 行业对齐：Character.AI / Replika「发一张照片」moment gallery + SillyTavern 场景立绘。
 * 与 generate_image 分流：瞬间 = 已有角色照；出图 = 本机新生成。
 * 真源：fitness gpt-image-runner character/leo_kuft/lifestyle/
 */

import { normalizeLeoScenarioId } from './leoPersona.core.js'

/**
 * @typedef {'home'|'gym'|'mirror'|'outdoor'|'couch'|'night'|'cafe'|'cook'|'walk'|'rain'|'date'|'hoodie'|'coffee'|'plate'|'phone'|'hand'|'hello'|'listen'|'laugh'|'park'|'game'|'shower'|'locker'|'tender'|'smug'|'sleepy'|'night_text'|'goodnight'} LeoStillId
 */

/**
 * @typedef {'selfie'|'daily'|'for_you'|'outfit'|'scene'|'mood'} LeoStillGroup
 */

/**
 * @typedef {{
 *   id: LeoStillId,
 *   src: string,
 *   labelZh: string,
 *   labelEn: string,
 *   group: LeoStillGroup,
 *   scenarios: ReadonlyArray<string>,
 * }} LeoStill
 */

/** @type {ReadonlyArray<LeoStill>} */
export const LEO_STILLS = Object.freeze([
  // —— selfie（行业：男友「发来」的原生形态）——
  {
    id: 'home',
    src: '/leo/scenes/home.png',
    labelZh: '家里自拍',
    labelEn: 'Home selfie',
    group: 'selfie',
    scenarios: ['none'],
  },
  {
    id: 'gym',
    src: '/leo/scenes/gym.png',
    labelZh: '练完',
    labelEn: 'Post-workout',
    group: 'selfie',
    scenarios: ['gym_after'],
  },
  {
    id: 'mirror',
    src: '/leo/scenes/mirror.png',
    labelZh: '健身房镜子',
    labelEn: 'Gym mirror',
    group: 'selfie',
    scenarios: ['gym_after'],
  },
  {
    id: 'outdoor',
    src: '/leo/scenes/outdoor.png',
    labelZh: '街头自拍',
    labelEn: 'Outdoor selfie',
    group: 'selfie',
    scenarios: ['none'],
  },
  {
    id: 'hello',
    src: '/leo/scenes/hello.png',
    labelZh: '招手你好',
    labelEn: 'Wave hello',
    group: 'selfie',
    scenarios: ['none'],
  },
  // —— daily ——
  {
    id: 'couch',
    src: '/leo/scenes/couch.png',
    labelZh: '沙发',
    labelEn: 'Couch',
    group: 'daily',
    scenarios: ['couch'],
  },
  {
    id: 'night',
    src: '/leo/scenes/night.png',
    labelZh: '床上看书',
    labelEn: 'Reading in bed',
    group: 'daily',
    scenarios: ['late_night'],
  },
  {
    id: 'night_text',
    src: '/leo/scenes/night_text.png',
    labelZh: '深夜手机',
    labelEn: 'Late-night text',
    group: 'daily',
    scenarios: ['late_night'],
  },
  {
    id: 'cafe',
    src: '/leo/scenes/cafe.png',
    labelZh: '咖啡馆',
    labelEn: 'Cafe',
    group: 'daily',
    scenarios: ['none'],
  },
  {
    id: 'cook',
    src: '/leo/scenes/cook.png',
    labelZh: '做饭',
    labelEn: 'Cooking',
    group: 'daily',
    scenarios: ['none', 'couch'],
  },
  {
    id: 'walk',
    src: '/leo/scenes/walk.png',
    labelZh: '街头走',
    labelEn: 'Walking',
    group: 'daily',
    scenarios: ['none'],
  },
  {
    id: 'rain',
    src: '/leo/scenes/rain.png',
    labelZh: '雨天窗边',
    labelEn: 'Rainy window',
    group: 'daily',
    scenarios: ['late_night', 'none'],
  },
  {
    id: 'park',
    src: '/leo/scenes/park.png',
    labelZh: '公园长椅',
    labelEn: 'Park bench',
    group: 'daily',
    scenarios: ['none'],
  },
  {
    id: 'game',
    src: '/leo/scenes/game.png',
    labelZh: '沙发打游戏',
    labelEn: 'Gaming couch',
    group: 'daily',
    scenarios: ['couch'],
  },
  // —— for you ——
  {
    id: 'coffee',
    src: '/leo/scenes/coffee.png',
    labelZh: '给你倒咖啡',
    labelEn: 'Coffee for you',
    group: 'for_you',
    scenarios: ['none', 'couch'],
  },
  {
    id: 'plate',
    src: '/leo/scenes/plate.png',
    labelZh: '端饭给你',
    labelEn: 'Dinner for you',
    group: 'for_you',
    scenarios: ['none', 'couch'],
  },
  {
    id: 'phone',
    src: '/leo/scenes/phone.png',
    labelZh: '给你看手机',
    labelEn: 'Show phone',
    group: 'for_you',
    scenarios: ['none', 'couch', 'late_night'],
  },
  {
    id: 'hand',
    src: '/leo/scenes/hand.png',
    labelZh: '伸手邀你',
    labelEn: 'Hand reach',
    group: 'for_you',
    scenarios: ['none'],
  },
  {
    id: 'listen',
    src: '/leo/scenes/listen.png',
    labelZh: '在听你说',
    labelEn: 'Listening',
    group: 'for_you',
    scenarios: ['none', 'late_night', 'couch'],
  },
  // —— outfit ——
  {
    id: 'date',
    src: '/leo/scenes/date.png',
    labelZh: '约会衬衫',
    labelEn: 'Date shirt',
    group: 'outfit',
    scenarios: ['none'],
  },
  {
    id: 'hoodie',
    src: '/leo/scenes/hoodie.png',
    labelZh: '灰卫衣',
    labelEn: 'Hoodie',
    group: 'outfit',
    scenarios: ['none', 'couch'],
  },
  {
    id: 'goodnight',
    src: '/leo/scenes/goodnight.png',
    labelZh: '睡前晚安',
    labelEn: 'Good night',
    group: 'outfit',
    scenarios: ['late_night'],
  },
  // —— scene（场景 chip 专用）——
  {
    id: 'shower',
    src: '/leo/scenes/shower.png',
    labelZh: '蒸汽淋浴',
    labelEn: 'Steam shower',
    group: 'scene',
    scenarios: ['shower'],
  },
  {
    id: 'locker',
    src: '/leo/scenes/locker.png',
    labelZh: '更衣室',
    labelEn: 'Locker room',
    group: 'scene',
    scenarios: ['gym_after', 'shower'],
  },
  // —— mood（表情向）——
  {
    id: 'laugh',
    src: '/leo/scenes/laugh.png',
    labelZh: '大笑',
    labelEn: 'Laughing',
    group: 'mood',
    scenarios: ['none'],
  },
  {
    id: 'tender',
    src: '/leo/scenes/tender.png',
    labelZh: '温柔',
    labelEn: 'Tender',
    group: 'mood',
    scenarios: ['late_night', 'shower'],
  },
  {
    id: 'smug',
    src: '/leo/scenes/smug.png',
    labelZh: '坏笑',
    labelEn: 'Smug',
    group: 'mood',
    scenarios: ['gym_after', 'shower'],
  },
  {
    id: 'sleepy',
    src: '/leo/scenes/sleepy.png',
    labelZh: '犯困',
    labelEn: 'Sleepy',
    group: 'mood',
    scenarios: ['late_night'],
  },
])

/** @type {ReadonlyArray<{ id: LeoStillGroup, zh: string, en: string }>} */
export const LEO_STILL_GROUPS = Object.freeze([
  { id: 'selfie', zh: '自拍', en: 'Selfie' },
  { id: 'daily', zh: '日常', en: 'Daily' },
  { id: 'for_you', zh: '给你', en: 'For you' },
  { id: 'outfit', zh: '穿搭', en: 'Outfit' },
  { id: 'scene', zh: '场景', en: 'Scene' },
  { id: 'mood', zh: '心情', en: 'Mood' },
])

/** @type {ReadonlyMap<string, LeoStill>} */
const BY_ID = new Map(LEO_STILLS.map((s) => [s.id, s]))

/**
 * @param {unknown} id
 * @returns {LeoStill | null}
 */
export function getLeoStill(id) {
  if (typeof id !== 'string') return null
  return BY_ID.get(id) || null
}

/**
 * Moment picker 分组列表。
 * @param {{ locale?: unknown, scenarioId?: unknown } | null | undefined} [opts]
 */
export function leoStillPickerGroups(opts = {}) {
  const en = opts?.locale === 'en'
  const sid = normalizeLeoScenarioId(opts?.scenarioId)
  return LEO_STILL_GROUPS.map((g) => ({
    id: g.id,
    label: en ? g.en : g.zh,
    items: LEO_STILLS.filter((s) => s.group === g.id).map((s) => ({
      ...s,
      label: en ? s.labelEn : s.labelZh,
      preferred: s.scenarios.includes(sid),
    })),
  })).filter((g) => g.items.length)
}

/**
 * 空态 / 场景 chip 用：按当前场景挑一张主静帧。
 * @param {{ scenarioId?: unknown } | null | undefined} [opts]
 * @returns {LeoStill}
 */
export function leoPresenceStill(opts = {}) {
  const sid = normalizeLeoScenarioId(opts?.scenarioId)
  /** 场景主图优先序（行业：每个场景一张「开场立绘」） */
  const preferred = {
    gym_after: ['gym', 'locker', 'mirror'],
    couch: ['couch', 'game', 'hoodie'],
    late_night: ['night_text', 'night', 'goodnight'],
    shower: ['shower', 'locker', 'tender'],
    none: ['home', 'hello', 'hoodie'],
  }
  for (const id of preferred[sid] || preferred.none) {
    const hit = BY_ID.get(id)
    if (hit) return hit
  }
  const hit = LEO_STILLS.find((s) => s.scenarios.includes(sid))
  return hit || BY_ID.get('home') || LEO_STILLS[0]
}

/**
 * 正文关键词 → 静帧选取规则。顺序即优先级(先命中先赢);
 * ids 依次取第一个存在的静帧,都不在库里则回落场景主图。
 * @type {ReadonlyArray<{ re: RegExp, ids: ReadonlyArray<LeoStillId> }>}
 */
const STILL_TEXT_RULES = Object.freeze([
  { re: /(?:招手|你好|hi\b|hello|wave)/i, ids: ['hello'] },
  { re: /(?:健身房|练完|locker|gym|sweat|post.?workout)/i, ids: ['gym'] },
  { re: /(?:镜子|mirror)/i, ids: ['mirror'] },
  { re: /(?:沙发|couch|blanket|movie)/i, ids: ['couch'] },
  { re: /(?:游戏|game|手柄|controller)/i, ids: ['game'] },
  {
    re: /(?:深夜|睡前|关灯|3am|late.?night|texting|手机)/i,
    ids: ['night_text', 'night'],
  },
  { re: /(?:看书|reading|床上)/i, ids: ['night'] },
  { re: /(?:咖啡店|咖啡馆|cafe)/i, ids: ['cafe'] },
  { re: /(?:咖啡|coffee)/i, ids: ['coffee'] },
  { re: /(?:做饭|下厨|cooking|端饭|dinner)/i, ids: ['plate', 'cook'] },
  { re: /(?:出门|约会|衬衫|date|shirt)/i, ids: ['date'] },
  { re: /(?:卫衣|hoodie)/i, ids: ['hoodie'] },
  { re: /(?:公园|park|散步|walk)/i, ids: ['park', 'walk'] },
  { re: /(?:雨|rain)/i, ids: ['rain'] },
  { re: /(?:听|listen)/i, ids: ['listen'] },
  { re: /(?:笑|哈哈|laugh)/i, ids: ['laugh'] },
  {
    re: /(?:困|sleepy|yawn|累了|晚安|good.?night)/i,
    ids: ['goodnight', 'sleepy'],
  },
  { re: /(?:坏笑|smug|得意)/i, ids: ['smug'] },
  { re: /(?:温柔|抱|aftercare|tender|抱着)/i, ids: ['tender'] },
  { re: /(?:淋浴|蒸汽|shower|steam)/i, ids: ['shower', 'tender'] },
  { re: /(?:更衣室|locker)/i, ids: ['locker'] },
  { re: /(?:牵手|伸手|走吧|hand)/i, ids: ['hand'] },
])

/**
 * 从用户/助手正文或场景启发式选一张静帧（Composer「瞬间」默认项）。
 * @param {{
 *   scenarioId?: unknown,
 *   text?: unknown,
 * } | null | undefined} [opts]
 * @returns {LeoStill}
 */
export function resolveLeoStill(opts = {}) {
  const text = String(opts?.text || '')
  const sid = normalizeLeoScenarioId(opts?.scenarioId)

  for (const rule of STILL_TEXT_RULES) {
    if (!rule.re.test(text)) continue
    for (const id of rule.ids) {
      const hit = BY_ID.get(id)
      if (hit) return hit
    }
    break
  }
  return leoPresenceStill({ scenarioId: sid })
}

/**
 * Leo 口吻短确认（配静帧，不经模型）。
 * @param {LeoStill | null | undefined} still
 * @param {{ locale?: unknown } | null | undefined} [opts]
 */
export function leoStillCaption(still, opts = {}) {
  const en = opts?.locale === 'en'
  const id = still?.id || 'home'
  /** @type {Partial<Record<LeoStillId, { zh: string, en: string }>>} */
  const lines = {
    home: { zh: '家里。你看我一眼就行。', en: 'Home. Just look at me a second.' },
    gym: { zh: '刚练完。还热着。……给你看一眼。', en: 'Just finished. Still warm.… For you.' },
    mirror: { zh: '镜子里这张——发给你。', en: 'This one from the mirror — for you.' },
    outdoor: { zh: '外面风不错。你在干嘛？', en: 'Nice wind out. What are you up to?' },
    hello: { zh: '嘿。……看到了？', en: 'Hey.… You see me?' },
    couch: { zh: '沙发这半边留给你。过来。', en: 'This half of the couch is yours. Come.' },
    night: { zh: '灯暗一点。……还不睡？那陪我。', en: 'Lights low.… Still up? Then stay.' },
    night_text: { zh: '还在刷？……那陪我聊两句。', en: 'Still scrolling?… Talk to me a bit.' },
    cafe: { zh: '窗边这杯。你要是在就好了。', en: 'This cup by the window. Wish you were here.' },
    cook: { zh: '在做。别催。', en: 'Cooking. Don\'t rush me.' },
    walk: { zh: '路上。你要是旁边就好了。', en: 'On the street. Better if you were next to me.' },
    rain: { zh: '下雨了。……你带伞了吗？', en: 'Raining.… You got an umbrella?' },
    park: { zh: '长椅空着。……来坐。', en: 'Bench is free.… Come sit.' },
    game: { zh: '再一局。……你来选。', en: 'One more round.… You pick.' },
    coffee: { zh: '给你倒的。趁热。', en: 'Made this for you. Still hot.' },
    plate: { zh: '做好了。尝尝。', en: 'Done. Taste it.' },
    phone: { zh: '看这个。——笑什么。', en: 'Look at this.— Why are you smiling.' },
    hand: { zh: '手给你。……走吗？', en: 'Hand.… Coming?' },
    listen: { zh: '说。我听着。', en: 'Talk. I\'m listening.' },
    date: { zh: '出门前照一下。够不够正式？', en: 'Check before we go. Formal enough?' },
    hoodie: { zh: '今天就这样。……舒服就行。', en: 'This is it today.… Comfort first.' },
    goodnight: { zh: '睡吧。……我还在。', en: 'Sleep.… I\'m still here.' },
    shower: { zh: '蒸汽有点大。……门给你留了。', en: 'Steam\'s thick.… Door\'s for you.' },
    locker: { zh: '更衣室就剩我们。……擦一下。', en: 'Locker\'s almost empty.… Wipe down.' },
    laugh: { zh: '……笑什么。你先笑的。', en: '…What. You laughed first.' },
    tender: { zh: '靠着我。……别急说话。', en: 'Lean on me.… No rush to talk.' },
    smug: { zh: '……看什么。知道你在看。', en: '…What. I know you are looking.' },
    sleepy: { zh: '有点困。……你还在就好。', en: 'Kinda sleepy.… Fine if you stay.' },
  }
  const pair = lines[/** @type {LeoStillId} */ (id)] || lines.home
  return en ? pair.en : pair.zh
}

/**
 * Composer「瞬间」旁白：说明这是现成照，不是生图。
 * @param {{ locale?: unknown } | null | undefined} [opts]
 */
export function leoStillChipHint(opts = {}) {
  return opts?.locale === 'en'
    ? 'Pick a ready Leo photo (instant, no gen)'
    : '选一张现成 Leo 照片（秒出，不生图）'
}
