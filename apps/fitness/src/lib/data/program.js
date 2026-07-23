/* ═══════════════════════════════════════════════════════
   FITNESS OS — PROGRAM DATA
   胸 · 背 · 腿 · 臂 四日轮换 · 手臂围优先
   依据：二头/三头直接量 12–18 组/周、RIR 1–2、臂日前腿日缓冲
   默认重量取自 KEN 教练训练记录（2025–2026 近期工作重量，单位 LBS）
═══════════════════════════════════════════════════════ */

import { broEx, pickExSpecs, EX_BY_ID, resolveExerciseId } from './exercises.js'

export {
  EX_BY_ID,
  EX_GROUPS,
  EX_ID_ALIASES,
  resolveExerciseId,
  exerciseIdVariants,
  getPoolExercisesForDay,
} from './exercises.js'

/* 单一标志色策略：训练日不再各自配色，统一收敛到能量红橙（CSS var --accent 控制）。 */
export const ACCENTS = {
  chest: 'var(--accent)',
  back: 'var(--accent)',
  arms: 'var(--accent)',
  legs: 'var(--accent)',
  core: 'var(--accent)',
  delts: 'var(--accent)',
  office: 'var(--accent)',
  morning: 'var(--accent)',
}

export const DAY_IMAGES = {
  chest: '/assets/images/exercises/c_bench.jpg',
  back: '/assets/images/exercises/b_pull.jpg',
  arms: '/assets/images/exercises/ar_hammer.jpg',
  legs: '/assets/images/exercises/l_squat.jpg',
  core: '/assets/images/exercises/co_plank.jpg',
  delts: '/assets/images/exercises/b_face.jpg',
  upper_a: '/assets/images/exercises/c_bench.jpg',
  upper_b: '/assets/images/exercises/b_pull.jpg',
  lower_a: '/assets/images/exercises/l_squat.jpg',
  lower_b: '/assets/images/exercises/l_press.jpg',
  push_a: '/assets/images/exercises/c_bench.jpg',
  push_b: '/assets/images/exercises/c_incdb.jpg',
  pull_a: '/assets/images/exercises/b_pull.jpg',
  pull_b: '/assets/images/exercises/b_row.jpg',
  legs_a: '/assets/images/exercises/l_squat.jpg',
  legs_b: '/assets/images/exercises/l_hack.jpg',
  full_a: '/assets/images/exercises/c_bench.jpg',
  full_b: '/assets/images/exercises/b_row.jpg',
  full_c: '/assets/images/exercises/l_squat.jpg',
}

/** 动作 id 与 static/assets/images/exercises/{id}.jpg 一一对应；无专属图的不映射（UI 显示占位） */
const DEDICATED_EX_IMAGE_IDS = [
  'sh_latraise',
  'sh_cableraise',
  'ar_ropeoh',
  'l_calf',
  'b_rdl',
  'c_bench',
  'c_incdb',
  'c_incmc',
  'c_decmc',
  'c_fly',
  'ar_dip',
  'b_pull',
  'b_pulldown',
  'b_row',
  'b_1arm',
  'b_seal',
  'b_ext',
  'b_face',
  'ar_bbcurl',
  'ar_pushdn',
  'ar_preacher',
  'ar_skull',
  'ar_hammer',
  'ar_rope',
  'ar_cablecurl',
  'l_squat',
  'l_hack',
  'l_press',
  'l_ext',
  'l_curl',
  'l_thrust',
  'l_abd',
  'co_hlr',
  'co_cablecrunch',
  'co_rollout',
  'co_woodchop',
  'co_plank',
]

export const EXERCISE_IMAGES = Object.fromEntries(
  DEDICATED_EX_IMAGE_IDS.map((id) => [
    id,
    `/assets/images/exercises/${id}.jpg`,
  ]),
)

/**
 * 同一动作在多个分类下有独立记录时，示范图挂在「动作」上、各记录共用一张。
 * 只影响取图，不走 EX_ID_ALIASES（那是历史/训练量迁移，会合并记录语义）。
 * key = 借图的记录 id，value = 图所在的规范记录 id。
 */
const EX_IMAGE_ALIASES = {
  l_rdl: 'b_rdl', // 罗马尼亚硬拉：腿日与背日共用同一示范图
}

/** 取该动作的专属图 key：先做记录别名，再做图片别名 */
function exImageKey(exId) {
  const id = resolveExerciseId(exId)
  return EX_IMAGE_ALIASES[id] ?? id
}

export function dayImage(id) {
  return DAY_IMAGES[id] ?? null
}

/** 动作缩略图：仅返回有专属图的路径，否则 null（由 UI 显示占位） */
export function exerciseImage(exId) {
  const id = exImageKey(exId)
  return EXERCISE_IMAGES[id] ?? EXERCISE_IMAGES[exId] ?? null
}

/** Focus 大图：仅专属动作图，无图时不借用训练日封面 */
export function focusHeroImage(exId) {
  const id = exImageKey(exId)
  return EXERCISE_IMAGES[id] ?? EXERCISE_IMAGES[exId] ?? null
}

/** 从模板日复制动作定义（浅拷贝，可覆盖组数等）；模板日没有时回退到动作目录默认值 */
function pickEx(days, fromDay, exId, patch = {}) {
  const src = days[fromDay]?.ex?.find((e) => e.id === exId) ?? EX_BY_ID[exId]
  if (!src) return null
  return { ...src, ...patch }
}

function pickMany(days, fromDay, specs) {
  return specs
    .map((s) =>
      typeof s === 'string'
        ? pickEx(days, fromDay, s)
        : pickEx(days, fromDay, s.id, s),
    )
    .filter(Boolean)
}

/**
 * Bro-split training days.
 * Field semantics: `cn` = primary label; `name` = decorative EN caps (zh UI only, see dayDecorEn()).
 */
const BRO_DAYS = {
  chest: {
    id: 'chest',
    name: 'CHEST',
    cn: '胸',
    accent: ACCENTS.chest,
    subtitle: '胸 · 前束 · 三头协同',
    label: '推',
    note: '以复合动作为主，控制离心；上斜训练优先补上胸厚度。三头容量留给臂日，胸日默认不含双杠。',
    vol: '胸 ~12 直接组 · 少占三头恢复',
    warmup: [
      { name: '弹力带扩胸', val: '2 × 15', note: '激活胸 + 肩袖' },
      { name: '空杆/轻重量卧推', val: '2 × 12', note: '建立动作轨迹' },
    ],
    ex: pickExSpecs([
      {
        id: 'c_bench',
        w: 80,
        anchor: true,
        alternatives: [
          { id: 'c_incmc', name: '上斜推胸器' },
          { id: 'c_decmc', name: '坐姿推胸器' },
        ],
      },
      { id: 'c_incdb', w: 47.5, unit: 'LBS/侧' },
      { id: 'c_incmc', w: 45 },
      { id: 'c_fly', w: 30 },
    ]),
  },
  back: {
    id: 'back',
    name: 'BACK',
    cn: '背',
    accent: ACCENTS.back,
    subtitle: '背宽 · 背厚 · 体态（后束/竖脊）',
    label: '拉',
    note: '以背宽、背厚为主，尽量避免二头预疲劳。大重量拉类可用助力带，让背阔而非握力成为限制因素。',
    vol: '背阔/中背 ~13 组 + 后束/竖脊 ~6 组 · 无弯举',
    warmup: [
      { name: '高位下拉（轻）', val: '2 × 15', note: '激活背阔' },
      { name: '面拉（轻）', val: '2 × 15', note: '激活后束/肩袖' },
    ],
    ex: pickExSpecs([
      {
        id: 'b_pull',
        anchor: true,
        sub: '力竭可加助力',
        alternatives: [
          { id: 'b_pulldown', name: '高位下拉' },
          { id: 'b_row', name: 'V 把坐姿划船' },
        ],
      },
      { id: 'b_chestsup', w: 45, reps: '8–12', rest: 120 },
      { id: 'b_pulldown', w: 130, reps: '10–15', rest: 90 },
      { id: 'b_row', w: 115 },
      { id: 'b_face', w: 100 },
      { id: 'b_ext', w: 45, sub: '抱 45 lb 杠片' },
    ]),
  },
  arms: {
    id: 'arms',
    name: 'ARMS',
    cn: '臂',
    accent: ACCENTS.arms,
    subtitle: '二头 · 三头 · 手臂围优先',
    label: '臂',
    note: '手臂围度专项日：窄握推和弯举放在首位，过头臂屈伸补三头长头，孤立动作收尾找泵感。RIR 1–2，最后一组孤立可到 0–1。',
    vol: '二头 ~8 组 · 三头 ~8 组 · 直接量可控',
    warmup: [
      { name: '绳索弯举（轻）', val: '2 × 15', note: '激活二头' },
      { name: '绳索下压（轻）', val: '2 × 15', note: '激活三头' },
    ],
    ex: pickExSpecs([
      { id: 'ar_cgbench', w: 65, anchor: true, reps: '8–10', rest: 120 },
      { id: 'ar_ezcurl', w: 55, sets: 3, reps: '8–12', rest: 90 },
      { id: 'ar_ropeoh', w: 40, sets: 3, reps: '10–15', rest: 80 },
      { id: 'ar_preacher', w: 65, reps: '10–12', rest: 75 },
      { id: 'ar_rope', w: 50, sets: 2, reps: '12–15', rest: 60 },
      {
        id: 'ar_hammer',
        w: 25,
        unit: 'LBS/侧',
        sets: 2,
        reps: '10–15',
        rest: 60,
      },
    ]),
  },
  legs: {
    id: 'legs',
    name: 'LEGS',
    cn: '腿',
    accent: ACCENTS.legs,
    subtitle: '股四 · 腘绳 · 臀',
    label: '腿',
    note: '深蹲优先保证安全与深度；腿日也作为臂日前的恢复缓冲。臀腿基础较好时，倒蹬和哈克可以上强度。',
    vol: '股四 ~10 组 · 腘绳/臀 ~9 组 · 小腿 4 组',
    warmup: [
      { name: '自重深蹲', val: '2 × 15', note: '激活髋膝踝' },
      { name: '腿弯举（轻）', val: '2 × 15', note: '激活腘绳' },
    ],
    ex: pickExSpecs([
      {
        id: 'l_squat',
        w: 55,
        rir: '2',
        anchor: true,
        reps: '6–10',
        rest: 150,
        alternatives: [
          { id: 'l_hack', name: '背式哈克深蹲' },
          { id: 'l_press', name: '倒蹬机' },
        ],
      },
      { id: 'l_rdl', w: 95 },
      { id: 'l_press', w: 180, reps: '10–12' },
      { id: 'l_curl', w: 120, reps: '10–15' },
      { id: 'l_ext', w: 150, reps: '12–15', rest: 75 },
      { id: 'l_thrust', w: 265, sub: '≈ 120 kg', reps: '10–12' },
      { id: 'l_calf', w: 180 },
    ]),
  },
  /* 腹/核心：附加训练，不进入四日轮换。 */
  core: {
    id: 'core',
    name: 'CORE',
    cn: '腹',
    accent: ACCENTS.core,
    supp: true,
    subtitle: '腹直肌 · 腹斜肌 · 核心稳定',
    label: '核心',
    note: '腹肌恢复快。默认接在腿日与臂日末尾（周 2 次）。腿日若已加练肩，时间紧可只做肩、把腹挪到臂日；想加到 3 次再接胸日。避开背日末尾——次日腿需要核心支撑深蹲。重视收缩质量：呼气顶峰挤压、离心慢放、避免甩动。',
    vol: '核心 ~16 组 · 接腿+臂 · 周 2 次',
    warmup: [
      { name: '死虫式', val: '2 × 10/侧', note: '激活深层核心' },
      { name: '臀桥', val: '2 × 12', note: '唤醒后链 / 防代偿' },
    ],
    ex: pickExSpecs([
      { id: 'co_hlr', anchor: true, sub: '自重 / 可夹哑铃' },
      { id: 'co_cablecrunch', w: 80 },
      { id: 'co_rollout', sub: '跪姿起步' },
      { id: 'co_woodchop', w: 40, unit: 'LBS' },
      { id: 'co_plank', sets: 3, reps: '40–60s', rest: 45 },
    ]),
  },
  /* 肩/三角肌「南瓜肩」协议：侧束造宽度 + 后束造立体；前束由胸推覆盖，不加班推举。 */
  delts: {
    id: 'delts',
    name: 'DELTS',
    cn: '肩',
    accent: ACCENTS.delts,
    supp: true,
    subtitle: '南瓜肩 · 侧束盖 · 后束立体',
    label: '肩',
    note: '科学目标（中级）：侧束与后束各约 12–16 有效组/周，分 2 次完成（Schoenfeld）。前束已由卧推覆盖，勿加班推举。默认接在胸日与腿日末尾：胸日推完侧束已热、加侧平举效率高；腿日上肢新鲜，保证第二课质量，且与胸日隔开背日（后束有恢复，背日面拉不叠到同一天）。12–20 次、RIR 0–1、离心 2–3 秒。',
    vol: '侧+后各 ~7 组/次 · 接胸+腿 · 周 2 次',
    warmup: [
      { name: '肩关节绕环', val: '2 × 10/向', note: '激活肩袖，幅度从小' },
      {
        name: '面拉（轻）',
        val: '2 × 15',
        note: '外旋/肩胛预激活（非增肌主项）',
      },
    ],
    ex: pickExSpecs([
      /* 侧束：肩宽「盖」——南瓜肩第一优先级 */
      {
        id: 'sh_cableraise',
        w: 15,
        anchor: true,
        sets: 4,
        reps: '12–20',
        rest: 60,
        rir: '0–1',
        alternatives: [{ id: 'sh_latraise', name: '哑铃侧平举' }],
      },
      {
        id: 'sh_latraise',
        w: 12,
        unit: 'LBS/侧',
        sets: 3,
        reps: '15–20',
        rest: 60,
        rir: '0–1',
      },
      /* 后束：立体/体态——器械反飞 EMG 优于面拉；哑铃飞鸟换自由轨迹 */
      {
        id: 'b_revfly',
        w: 80,
        sets: 4,
        reps: '12–15',
        rest: 60,
        rir: '0–1',
        alternatives: [{ id: 'sh_reardelt', name: '俯身哑铃后束飞鸟' }],
      },
      {
        id: 'sh_reardelt',
        w: 10,
        unit: 'LBS/侧',
        sets: 3,
        reps: '12–15',
        rest: 60,
        rir: '0–1',
        alternatives: [{ id: 'sh_bentlat', name: '俯身侧平举' }],
      },
    ]),
  },
  /* 办公久坐恢复：附加训练，改善髋屈肌紧张与圆肩。 */
  office: {
    id: 'office',
    name: 'MOBILITY',
    cn: '办公恢复',
    accent: ACCENTS.office,
    supp: true,
    subtitle: '髋屈 · 胸椎 · 肩袖 · 核心激活',
    label: '恢复',
    note: '适合久坐办公后或晚间放松。慢呼吸、不弹振，拉伸到有张力即可，避免拉到疼痛。可在任意训练日结尾加练，或单独安排，每周 2–3 次为宜。',
    vol: '灵活性 ~12 组 · 约 20–25 分钟',
    warmup: [
      {
        name: '深呼吸 + 肩胛绕环',
        val: '1 × 8/向',
        note: '放松颈肩，建立节奏',
      },
      { name: '站姿髋画圈', val: '1 × 6/向', note: '唤醒髋关节' },
    ],
    ex: [
      {
        id: 'mo_hipflex',
        name: '跪姿髋屈肌拉伸',
        m: '髋屈肌',
        sets: 2,
        reps: '30–45s/侧',
        rest: 30,
        rir: '静控',
        w: 0,
        sub: '自重',
        cues: [
          '后膝着地，前脚平放，骨盆微后倾',
          '感受前侧髋拉伸，避免弓腰',
          '呼气时加深幅度，不弹振',
        ],
      },
      {
        id: 'mo_catcow',
        name: '猫牛式',
        m: '脊柱灵活',
        sets: 2,
        reps: '10–12',
        rest: 30,
        rir: '慢控',
        w: 0,
        sub: '自重',
        cues: [
          '四足支撑，吸气塌腰抬头',
          '呼气卷背低头，逐节活动',
          '幅度舒适范围内，不强行折腰',
        ],
      },
      {
        id: 'mo_tspin',
        name: '四足胸椎旋转',
        m: '胸椎',
        sets: 2,
        reps: '8–10/侧',
        rest: 30,
        rir: '慢控',
        w: 0,
        sub: '自重',
        cues: [
          '一手放耳后，另一手撑地',
          '旋转来自胸椎，骨盆尽量不动',
          '呼气转到底，吸气回位',
        ],
      },
      {
        id: 'mo_bandpa',
        name: '弹力带后收',
        m: '肩袖/后束',
        sets: 2,
        reps: '15–20',
        rest: 30,
        rir: '质量',
        w: 0,
        sub: '轻阻力带',
        cues: [
          '双臂前伸，弹力带拉至胸口高度',
          '肩胛后缩夹紧，肘略弯',
          '对抗圆肩，宁慢勿重',
        ],
      },
      {
        id: 'mo_wallslide',
        name: '墙面滑动',
        m: '肩屈/上背',
        sets: 2,
        reps: '10–12',
        rest: 45,
        rir: '质量',
        w: 0,
        sub: '贴墙',
        cues: [
          '背、臀、后脑贴墙，手臂贴墙滑动',
          '上举时肩胛保持稳定，肋骨内收',
          '下放到可控范围即可',
        ],
      },
      {
        id: 'mo_deadbug',
        name: '死虫式',
        m: '核心稳定',
        sets: 2,
        reps: '10/侧',
        rest: 45,
        rir: '慢控',
        w: 0,
        sub: '自重',
        cues: [
          '仰卧，下背贴地，对侧手脚缓慢伸展',
          '伸展时呼气，核心保持收紧',
          '腰离地就缩小幅度',
        ],
      },
      {
        id: 'mo_lunge',
        name: '行走弓步拉伸',
        m: '髋/股四',
        sets: 2,
        reps: '8/侧',
        rest: 30,
        rir: '静控',
        w: 0,
        sub: '自重',
        cues: [
          '大步弓步，后膝可轻触地',
          '骨盆中立，感受前侧髋与股四',
          '慢走慢停，不借惯性',
        ],
      },
    ],
  },
  /* 晨间激活：附加训练，短时唤醒全身。 */
  morning: {
    id: 'morning',
    name: 'ACTIVATE',
    cn: '晨间激活',
    accent: ACCENTS.morning,
    supp: true,
    subtitle: '流动拉伸 · 关节唤醒 · 轻有氧',
    label: '激活',
    note: '起床后 10–15 分钟轻激活，心率略升即可。不计入正式训练容量，出差或繁忙周也能做。',
    vol: '激活 ~10 组 · 约 15 分钟',
    warmup: [
      { name: '腹式呼吸', val: '1 × 5 次', note: '鼻吸口呼，放松副交感' },
    ],
    ex: [
      {
        id: 'mo_world',
        name: '全球最伟大拉伸',
        m: '全身流动',
        sets: 2,
        reps: '5/侧',
        rest: 30,
        rir: '慢控',
        w: 0,
        sub: '自重',
        cues: [
          '弓步 → 同侧手肘触地 → 旋转展臂',
          '一步流动，不卡节奏',
          '幅度从小开始',
        ],
      },
      {
        id: 'mo_inchworm',
        name: '英寸虫',
        m: '后链/核心',
        sets: 2,
        reps: '6–8',
        rest: 30,
        rir: '慢控',
        w: 0,
        sub: '自重',
        cues: [
          '站立前屈手触地，小步走至平板',
          '再小步走回，腿尽量伸直',
          '核心收紧，避免塌腰',
        ],
      },
      {
        id: 'mo_hipcircle',
        name: '站姿髋环绕',
        m: '髋关节',
        sets: 2,
        reps: '8/向',
        rest: 25,
        rir: '质量',
        w: 0,
        sub: '自重',
        cues: [
          '扶墙单腿站立，髋画大圈',
          '内外各一圈，骨盆稳定',
          '激活臀中肌与髋囊',
        ],
      },
      {
        id: 'mo_armcircle',
        name: '手臂环绕 + Y 字上举',
        m: '肩带',
        sets: 2,
        reps: '10/向',
        rest: 25,
        rir: '质量',
        w: 0,
        sub: '自重',
        cues: [
          '先小后大画圈，再 Y 字上举',
          '上举时肩胛下沉，不耸肩',
          '配合呼吸，节奏均匀',
        ],
      },
      {
        id: 'mo_bwsquat',
        name: '自重深蹲激活',
        m: '下肢',
        sets: 2,
        reps: '12–15',
        rest: 45,
        rir: '质量',
        w: 0,
        sub: '自重',
        cues: [
          '脚略宽于肩，脚尖微外八',
          '下蹲至舒适深度，膝跟脚尖同向',
          '底部停 1 秒再站起，不弹起',
        ],
      },
    ],
  },
}

const UL_DAYS = {
  upper_a: {
    id: 'upper_a',
    name: 'UPPER A',
    cn: '上肢 A',
    accent: ACCENTS.chest,
    subtitle: '推 · 胸肩三头 · 上肢优先',
    label: '推',
    note: '上肢 A：复合推类放在首位，胸肩三头容量略高。减脂期建议留 1–2 RIR，质量优先于重量。',
    vol: '胸 ~14 组 · 三头 ~6 组 · MAV 区间',
    warmup: [
      { name: '弹力带扩胸', val: '2 × 15', note: '激活胸 + 肩袖' },
      { name: '空杆/轻重量卧推', val: '2 × 12', note: '建立动作轨迹' },
    ],
    ex: pickMany(BRO_DAYS, 'chest', [
      'c_bench',
      'c_incdb',
      'c_incmc',
      'c_fly',
      'ar_dip',
      'c_dbpress',
    ]).concat(
      pickMany(BRO_DAYS, 'arms', ['ar_pushdn']),
      pickExSpecs([{ id: 'sh_latraise', sets: 2, w: 12, unit: 'LBS/侧' }]),
    ),
  },
  lower_a: {
    id: 'lower_a',
    name: 'LOWER A',
    cn: '下肢 A',
    accent: ACCENTS.legs,
    subtitle: '股四 · 腘绳 · 臀 · 主强度',
    label: '腿',
    note: '下肢主强度日：深蹲类优先，维持臀腿基础。减脂期深蹲建议留 2 RIR，避免每周练到力竭。',
    vol: '股四 ~13 组 · 腘绳/臀 ~9 组',
    warmup: BRO_DAYS.legs.warmup,
    ex: pickMany(BRO_DAYS, 'legs', [
      'l_squat',
      'l_hack',
      'l_press',
      'l_curl',
      'l_thrust',
      'l_abd',
    ]),
  },
  upper_b: {
    id: 'upper_b',
    name: 'UPPER B',
    cn: '上肢 B',
    accent: ACCENTS.back,
    subtitle: '拉 · 背 · 二头 · 体态',
    label: '拉',
    note: '上肢 B：垂直拉 + 水平拉建立背宽厚，面拉保护肩带；二头三头收尾补围度。',
    vol: '背 ~14 组 · 二头 ~10 组 · 三头 ~6 组',
    warmup: BRO_DAYS.back.warmup,
    ex: pickMany(BRO_DAYS, 'back', [
      'b_pull',
      'b_row',
      'b_1arm',
      'b_face',
    ]).concat(
      pickMany(BRO_DAYS, 'arms', [
        'ar_bbcurl',
        'ar_preacher',
        'ar_skull',
        'ar_rope',
      ]),
    ),
  },
  lower_b: {
    id: 'lower_b',
    name: 'LOWER B',
    cn: '下肢 B',
    accent: ACCENTS.legs,
    subtitle: '股四 · 腘绳 · 臀 · 中等量',
    label: '腿',
    note: '下肢 B：不做大重量深蹲，以倒蹬和孤立动作为主，恢复压力更小，适合减脂周。',
    vol: '股四 ~9 组 · 腘绳/臀 ~9 组',
    warmup: [
      { name: '腿屈伸（轻）', val: '2 × 15', note: '激活股四' },
      { name: '腿弯举（轻）', val: '2 × 15', note: '激活腘绳' },
    ],
    ex: pickMany(BRO_DAYS, 'legs', [
      'l_press',
      'l_ext',
      'l_curl',
      'l_thrust',
      { id: 'l_abd', sets: 2 },
    ]),
  },
}

const PPL_DAYS = {
  push_a: {
    id: 'push_a',
    name: 'PUSH A',
    cn: '推 A',
    accent: ACCENTS.chest,
    subtitle: '胸 · 肩 · 三头 · 复合优先',
    label: '推',
    note: 'PPL 推日 A：卧推和上斜为主力，经典 Reddit PPL 结构的精简版。',
    vol: '胸 ~13 组 · 三头 ~6 组',
    warmup: BRO_DAYS.chest.warmup,
    ex: pickMany(BRO_DAYS, 'chest', [
      'c_bench',
      'c_incdb',
      'c_incmc',
      'c_decmc',
    ]).concat(
      pickExSpecs([{ id: 'sh_dbpress', sets: 3 }]),
      pickMany(BRO_DAYS, 'arms', ['ar_pushdn', { id: 'ar_skull', sets: 3 }]),
    ),
  },
  pull_a: {
    id: 'pull_a',
    name: 'PULL A',
    cn: '拉 A',
    accent: ACCENTS.back,
    subtitle: '背宽 · 背厚 · 二头',
    label: '拉',
    note: 'PPL 拉日 A：引体/下拉建背宽，划船建背厚，弯举收尾。',
    vol: '背 ~13 组 · 二头 ~7 组',
    warmup: BRO_DAYS.back.warmup,
    ex: pickMany(BRO_DAYS, 'back', [
      'b_pull',
      'b_pulldown',
      'b_row',
      'b_face',
    ]).concat(pickMany(BRO_DAYS, 'arms', ['ar_bbcurl', 'ar_hammer'])),
  },
  legs_a: {
    id: 'legs_a',
    name: 'LEGS A',
    cn: '腿 A',
    accent: ACCENTS.legs,
    subtitle: '股四 · 腘绳 · 臀 · 主强度',
    label: '腿',
    note: 'PPL 腿日 A：深蹲类搭配腘绳和臀部训练，维持下肢力量基础。',
    vol: '股四 ~10 组 · 腘绳/臀 ~9 组',
    warmup: BRO_DAYS.legs.warmup,
    ex: pickMany(BRO_DAYS, 'legs', [
      'l_squat',
      'l_hack',
      'l_press',
      'l_curl',
      'l_thrust',
    ]),
  },
  push_b: {
    id: 'push_b',
    name: 'PUSH B',
    cn: '推 B',
    accent: ACCENTS.chest,
    subtitle: '上胸 · 孤立推 · 三头',
    label: '推',
    note: 'PPL 推日 B：上斜推和夹胸/双杠换角度，补充胸肌刺激。',
    vol: '胸 ~12 组 · 三头 ~6 组',
    warmup: BRO_DAYS.chest.warmup,
    ex: pickMany(BRO_DAYS, 'chest', [
      'c_incdb',
      'c_incmc',
      'c_fly',
      'ar_dip',
    ]).concat(
      pickExSpecs([{ id: 'sh_latraise', sets: 3 }]),
      pickMany(BRO_DAYS, 'arms', ['ar_rope', 'ar_pushdn']),
    ),
  },
  pull_b: {
    id: 'pull_b',
    name: 'PULL B',
    cn: '拉 B',
    accent: ACCENTS.back,
    subtitle: '划船 · 后束 · 二头',
    label: '拉',
    note: 'PPL 拉日 B：水平拉、面拉和海豹划船换动作，避免平台期。',
    vol: '背 ~12 组 · 二头 ~6 组',
    warmup: BRO_DAYS.back.warmup,
    ex: pickMany(BRO_DAYS, 'back', [
      'b_pulldown',
      'b_row',
      'b_seal',
      'b_ext',
      'b_face',
    ]).concat(pickMany(BRO_DAYS, 'arms', ['ar_cablecurl'])),
  },
  legs_b: {
    id: 'legs_b',
    name: 'LEGS B',
    cn: '腿 B',
    accent: ACCENTS.legs,
    subtitle: '倒蹬 · 孤立 · 中等量',
    label: '腿',
    note: 'PPL 腿日 B：倒蹬和孤立为主，强度比腿 A 略低，适合高频腿日。',
    vol: '股四 ~9 组 · 腘绳/臀 ~6 组',
    warmup: UL_DAYS.lower_b.warmup,
    ex: pickMany(BRO_DAYS, 'legs', [
      'l_press',
      'l_hack',
      'l_ext',
      'l_curl',
      'l_abd',
    ]),
  },
}

const FB_WARMUP = [
  { name: '空杆/轻重量卧推', val: '2 × 12', note: '激活推类' },
  { name: '高位下拉（轻）', val: '2 × 15', note: '激活拉类' },
]

const FB_DAYS = {
  full_a: {
    id: 'full_a',
    name: 'FULL A',
    cn: '全身 A',
    accent: ACCENTS.chest,
    subtitle: '推 · 拉 · 腿 · 各 1 复合',
    label: '全身',
    note: '全身 A：每次 1 推 1 拉 1 腿，并搭配臂部训练。单课容量适中，适合减脂保肌。',
    vol: '全身 ~12 直接组 · 每周 3 次',
    warmup: FB_WARMUP,
    ex: pickMany(BRO_DAYS, 'chest', [{ id: 'c_bench', sets: 3 }])
      .concat(pickMany(BRO_DAYS, 'back', [{ id: 'b_row', sets: 3 }]))
      .concat(
        pickMany(BRO_DAYS, 'legs', [{ id: 'l_squat', sets: 3, rir: '2' }]),
      )
      .concat(pickMany(BRO_DAYS, 'arms', ['ar_bbcurl', 'ar_pushdn'])),
  },
  full_b: {
    id: 'full_b',
    name: 'FULL B',
    cn: '全身 B',
    accent: ACCENTS.back,
    subtitle: '上胸 · 垂直拉 · 倒蹬',
    label: '全身',
    note: '全身 B：换角度覆盖上胸、背阔与股四，符合 ACSM 推荐的全局刺激思路。',
    vol: '全身 ~12 直接组',
    warmup: FB_WARMUP,
    ex: pickMany(BRO_DAYS, 'chest', [{ id: 'c_incdb', sets: 3 }])
      .concat(pickMany(BRO_DAYS, 'back', [{ id: 'b_pull', sets: 3 }]))
      .concat(pickMany(BRO_DAYS, 'legs', [{ id: 'l_press', sets: 3 }]))
      .concat(pickMany(BRO_DAYS, 'back', [{ id: 'b_face', sets: 2 }]))
      .concat(pickMany(BRO_DAYS, 'arms', [{ id: 'ar_hammer', sets: 2 }])),
  },
  full_c: {
    id: 'full_c',
    name: 'FULL C',
    cn: '全身 C',
    accent: ACCENTS.legs,
    subtitle: '推胸器 · 划船 · 哈克',
    label: '全身',
    note: '全身 C：以器械为主、关节友好，恢复快，适合繁忙周或减载周。',
    vol: '全身 ~11 直接组',
    warmup: FB_WARMUP,
    ex: pickMany(BRO_DAYS, 'chest', [{ id: 'c_incmc', sets: 3 }])
      .concat(pickMany(BRO_DAYS, 'back', [{ id: 'b_pulldown', sets: 3 }]))
      .concat(pickMany(BRO_DAYS, 'legs', [{ id: 'l_hack', sets: 3 }]))
      .concat(pickMany(BRO_DAYS, 'legs', [{ id: 'l_curl', sets: 2 }]))
      .concat(pickMany(BRO_DAYS, 'arms', [{ id: 'ar_rope', sets: 2 }])),
  },
}

const ATHLETE = 'KEN · 186cm · 88kg · 自然训练'

export const DEFAULT_PROGRAM_ID = 'bro-split'

/** @typedef {{ id: string, meta: object, rotationOrder: string[], suppSchedule?: Record<string, { after: string[], timesPerWeek: number }>, days: Record<string, object> }} ProgramDef */

/** @type {ProgramDef[]} */
export const PROGRAMS = [
  {
    id: 'bro-split',
    meta: {
      name: '胸 · 背 · 腿 · 臂 循环',
      shortName: '四日分化',
      athlete: ATHLETE,
      goalLabel: '手臂围度 · 上肢优先',
      description:
        '手臂围度优先：胸 → 背 → 腿 → 臂轮换。臂日前有腿日缓冲，且不接在背日后。每日保留核心动作，双杠/弯举等可在可选库补充。',
      source: 'Kenos Training 定制 · 二头/三头直接量 12–18 组/周 · RIR 1–2',
      daysPerWeek: 4,
      level: '中级',
      tags: ['默认', '手臂围优先', '上肢优先'],
    },
    rotationOrder: ['chest', 'back', 'legs', 'arms'],
    /* 肩：胸日（推完侧束已热）+ 腿日（上肢新鲜，与胸隔开背日） */
    /* 腹：腿日+臂日末尾；避开背日（次日腿需核心支撑） */
    suppSchedule: {
      delts: { after: ['chest', 'legs'], timesPerWeek: 2 },
      core: { after: ['legs', 'arms'], timesPerWeek: 2 },
    },
    days: { ...BRO_DAYS },
  },
  {
    id: 'upper-lower-4',
    meta: {
      name: '上下肢 4 日 · 上肢优先',
      shortName: '上下 4 日',
      athlete: ATHLETE,
      goalLabel: '保肌降脂 · 上肢围度',
      description:
        '每个肌群每周练 2 次；两个上肢日容量略高，两个下肢日一重一轻。减脂期较均衡的选择。',
      source:
        '依据 Schoenfeld 等 meta-analysis：每肌群 ≥2 次/周更利于增肌；上下肢是经典 4 日结构',
      daysPerWeek: 4,
      level: '中级',
      tags: ['推荐', '减脂友好', '2×频率'],
    },
    rotationOrder: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
    suppSchedule: {
      delts: { after: ['upper_a', 'lower_a'], timesPerWeek: 2 },
      core: { after: ['lower_a', 'lower_b'], timesPerWeek: 2 },
    },
    days: {
      ...UL_DAYS,
      core: BRO_DAYS.core,
      delts: BRO_DAYS.delts,
      office: BRO_DAYS.office,
      morning: BRO_DAYS.morning,
    },
  },
  {
    id: 'ppl-6',
    meta: {
      name: '推拉腿 6 日 · 经典 PPL',
      shortName: 'PPL 6 日',
      athlete: ATHLETE,
      goalLabel: '上肢高频 · 围度最大化',
      description:
        '推/拉/腿（PPL）各练 2 次/周，上肢刺激频率高。总容量偏大，更适合增肌期；减脂期请注意睡眠与恢复。',
      source:
        '源自社区经典 Reddit PPL（Metallicadpa 模板思路）· 总容量对齐 Schoenfeld 每周 10–20 组/肌群',
      daysPerWeek: 6,
      level: '中高级',
      tags: ['高频', '上肢', '高容量'],
    },
    rotationOrder: ['push_a', 'pull_a', 'legs_a', 'push_b', 'pull_b', 'legs_b'],
    suppSchedule: {
      delts: { after: ['push_a', 'push_b'], timesPerWeek: 2 },
      core: { after: ['legs_a', 'legs_b'], timesPerWeek: 2 },
    },
    days: {
      ...PPL_DAYS,
      core: BRO_DAYS.core,
      delts: BRO_DAYS.delts,
      office: BRO_DAYS.office,
      morning: BRO_DAYS.morning,
    },
  },
  {
    id: 'fullbody-3',
    meta: {
      name: '全身 3 日 · 保肌减脂',
      shortName: '全身 3 日',
      athlete: ATHLETE,
      goalLabel: '保肌 · 时间高效',
      description:
        '每次覆盖推、拉、腿各 1 个复合动作，并搭配臂部训练。单课时间短、恢复快，适合繁忙周或减脂初期。',
      source:
        'ACSM 建议每周 ≥2 次全身阻力训练；McMaster 等研究：3 次/周全身高频在容量等同时有效',
      daysPerWeek: 3,
      level: '初中级',
      tags: ['减脂', '省时', '恢复快'],
    },
    rotationOrder: ['full_a', 'full_b', 'full_c'],
    suppSchedule: {
      delts: { after: ['full_a', 'full_c'], timesPerWeek: 2 },
      core: { after: ['full_b', 'full_c'], timesPerWeek: 2 },
    },
    days: {
      ...FB_DAYS,
      core: BRO_DAYS.core,
      delts: BRO_DAYS.delts,
      office: BRO_DAYS.office,
      morning: BRO_DAYS.morning,
    },
  },
]

export function getProgramById(id) {
  return PROGRAMS.find((p) => p.id === id) ?? PROGRAMS[0]
}

export function listPrograms() {
  return PROGRAMS
}

export function rotationLabel(program) {
  return program.rotationOrder
    .map((id) => program.days[id]?.cn ?? id)
    .join(' → ')
}

/**
 * 某补充日的科学配对（接在哪些主日末尾）。
 * @param {ProgramDef} program
 * @param {string} suppId
 * @returns {{ after: string[], timesPerWeek: number } | null}
 */
export function getSuppSchedule(program, suppId) {
  const sch = program?.suppSchedule?.[suppId]
  if (!sch?.after?.length) return null
  return {
    after: sch.after.filter((id) => program.days[id] && !program.days[id].supp),
    timesPerWeek: sch.timesPerWeek ?? sch.after.length,
  }
}

/**
 * 今日主训日建议加练的补充日（按 suppSchedule.after）。
 * @param {ProgramDef} program
 * @param {string} mainDayId
 * @returns {string[]}
 */
export function suggestedSuppAfter(program, mainDayId) {
  if (!program?.suppSchedule || !mainDayId) return []
  const out = []
  for (const [suppId, sch] of Object.entries(program.suppSchedule)) {
    if (!program.days[suppId]?.supp) continue
    if (sch.after?.includes(mainDayId)) out.push(suppId)
  }
  return out
}

/** 默认计划（向后兼容） */
export const PROGRAM = getProgramById(DEFAULT_PROGRAM_ID)
