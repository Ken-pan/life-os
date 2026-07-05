/* ═══════════════════════════════════════════════════════
   FITNESS OS — EXERCISE CATALOG
   主流健身房动作全集 · 供计划日与「可选动作库」共用
═══════════════════════════════════════════════════════ */

/**
 * equip 重量语义（见 tools/calculators.js EQUIP_INFO）：
 *   barbell/ezbar/smith = 总重含杆 · plateloaded = 单端装片总重（地雷管/T 杠）
 *   dumbbell = 单只重量（每侧） · single = 单只总重（高脚杯/仰卧上拉）
 *   machine/cable = 配重片总重 · plate = 手持负重片 · bodyweight = 自重（数字为附加负重）
 * @typedef {{ id: string, name: string, m: string, sets: number, reps: string, rest: number, rir: string, w?: number, unit?: string, equip?: string, sub?: string, anchor?: boolean, alternatives?: { id: string, name: string }[], cues?: string[] }} ExerciseDef
 */

/** @param {Partial<ExerciseDef> & Pick<ExerciseDef, 'id'|'name'|'m'>} def */
function ex(def) {
  return {
    sets: 3,
    reps: '10–12',
    rest: 90,
    rir: '1–2',
    w: 0,
    ...def
  };
}

/** @type {Record<string, ExerciseDef[]>} */
export const EX_GROUPS = {
  chest: [
    ex({ id: 'c_bench', equip: 'barbell', name: '杠铃卧推', m: '胸', sets: 4, reps: '6–8', rest: 150,
      cues: ['肩胛后缩下沉，全程夹背稳住', '下放至胸下沿轻触，控制离心不弹起', '脚踩实地面发力，臀不离凳'] }),
    ex({ id: 'c_dbpress', equip: 'dumbbell', name: '哑铃平板卧推', m: '胸', sets: 3, reps: '8–12', rest: 120,
      cues: ['哑铃独立控制，底部充分拉伸', '推起时微内收，顶峰不撞铃'] }),
    ex({ id: 'c_incdb', equip: 'dumbbell', name: '上斜哑铃卧推', m: '上胸', sets: 3, reps: '8–12', rest: 120,
      cues: ['斜板 30°，重点上胸', '底部充分拉伸再推起，顶部不撞铃'] }),
    ex({ id: 'c_incmc', equip: 'machine', name: '上斜推胸器', m: '上胸', sets: 3, reps: '10–12', rest: 90,
      cues: ['坐姿稳住，推到位保持张力', '离心慢放感受上胸'] }),
    ex({ id: 'c_decmc', equip: 'machine', name: '坐姿（下斜）推胸器', m: '中下胸', sets: 3, reps: '12', rest: 90,
      cues: ['挺胸沉肩，肘走弧线', '顶峰收缩挤压一秒'] }),
    ex({ id: 'c_decdb', equip: 'dumbbell', name: '下斜哑铃卧推', m: '下胸', sets: 3, reps: '10–12', rest: 90,
      cues: ['下斜位固定，控制下放深度', '推起时夹胸，肩胛下沉'] }),
    ex({ id: 'c_smithbench', equip: 'smith', name: '史密斯卧推', m: '胸', sets: 3, reps: '8–12', rest: 120,
      cues: ['杠路固定，专注胸肌发力', '落点一致，离心可控'] }),
    ex({ id: 'c_floorpress', equip: 'barbell', name: '地板卧推', m: '胸/三头', sets: 3, reps: '8–10', rest: 120,
      cues: ['肘触地即停，减少肩压力', '适合肩不适时替代平板卧推'] }),
    ex({ id: 'c_landmine', equip: 'plateloaded', name: '地雷管推胸', m: '上胸', sets: 3, reps: '10–12', rest: 90,
      cues: ['单臂或双手推起，核心收紧', '弧线轨迹，顶峰挤压上胸'] }),
    ex({ id: 'c_fly', equip: 'cable', name: '绳索夹胸', m: '胸孤立', sets: 3, reps: '12–15', rest: 75, rir: '1',
      sub: '龙门架 / 蝴蝶机变式',
      cues: ['大臂主导，肘微屈固定', '顶峰挤压，离心充分拉伸'] }),
    ex({ id: 'c_pecdeck', equip: 'machine', name: '蝴蝶机夹胸', m: '胸孤立', sets: 3, reps: '12–15', rest: 75, rir: '1',
      cues: ['肩胛后缩贴靠，纯胸肌内收', '顶峰停一秒，慢放'] }),
    ex({ id: 'c_cablefly', equip: 'cable', name: '绳索夹胸（低位）', m: '胸孤立', sets: 3, reps: '12–15', rest: 75, rir: '1',
      cues: ['低位绳索上收，刺激下胸', '肘微屈，画弧夹胸'] }),
    ex({ id: 'c_incbb', equip: 'barbell', name: '上斜杠铃卧推', m: '上胸', sets: 3, reps: '6–10', rest: 150,
      cues: ['斜板 30°，杠路稳定', '落点上胸，推起不锁死肘'] }),
    ex({ id: 'c_pushup', equip: 'bodyweight', name: '俯卧撑', m: '胸/三头', sets: 3, reps: '12–20', rest: 60, sub: '自重 / 可负重',
      cues: ['身体一条线，核心收紧', '胸触地或接近地面，推起顶峰不锁死'] }),
    ex({ id: 'c_machinepress', equip: 'machine', name: '坐姿推胸器', m: '胸', sets: 3, reps: '10–12', rest: 90,
      cues: ['肩胛后缩贴靠，推到位保持张力', '离心慢放，肩胛保持稳定'] }),
    ex({ id: 'c_svend', equip: 'plate', name: 'Svend 夹推', m: '胸内侧', sets: 3, reps: '12–15', rest: 60, rir: '1',
      cues: ['双掌夹住杠片或哑铃，胸前推挤', '顶峰挤压一秒，轻重量高质量'] })
  ],
  back: [
    ex({ id: 'b_pull', equip: 'bodyweight', name: '引体向上', m: '背阔/背宽', sets: 4, reps: '6–10', rest: 150, sub: '力竭可加助力',
      cues: ['先沉肩胛再拉，用背不用手臂', '拉到锁骨下沿，顶峰挤压一秒', '离心控制慢放，全程不晃'] }),
    ex({ id: 'b_chinup', equip: 'bodyweight', name: '反手引体向上', m: '背阔/二头', sets: 3, reps: '6–10', rest: 120, sub: '自重',
      cues: ['反握略窄，二头参与更多', '拉到胸触杠，肩胛下沉'] }),
    ex({ id: 'b_pulldown', equip: 'cable', name: '高位下拉', m: '背阔', sets: 3, reps: '10–12', rest: 120,
      cues: ['宽握，挺胸拉向上胸', '肘向下后方走，挤压背阔'] }),
    ex({ id: 'b_straightarm', equip: 'cable', name: '直臂下拉', m: '背阔', sets: 3, reps: '12–15', rest: 75, rir: '1',
      cues: ['手臂微屈固定，纯背阔下压', '顶峰挤压，离心慢放'] }),
    ex({ id: 'b_row', equip: 'cable', name: 'V 把坐姿划船', m: '中背/背厚', sets: 3, reps: '10–12', rest: 90,
      cues: ['挺胸不含背，肩胛主动后缩', '离心放到背阔充分伸展'] }),
    ex({ id: 'b_bbrow', equip: 'barbell', name: '杠铃俯身划船', m: '背厚', sets: 3, reps: '8–10', rest: 120,
      cues: ['髋铰链俯身，背中立', '拉向肚脐，肘贴身后'] }),
    ex({ id: 'b_cablerow', equip: 'cable', name: '坐姿绳索划船', m: '中背', sets: 3, reps: '10–12', rest: 90,
      cues: ['挺胸，拉向腹部', '顶峰挤压肩胛，离心伸展'] }),
    ex({ id: 'b_tbar', equip: 'plateloaded', name: 'T 杠划船', m: '背厚', sets: 3, reps: '8–12', rest: 120,
      cues: ['俯身稳定，拉向胸腹', '背肌主导，腰不代偿'] }),
    ex({ id: 'b_chestsup', equip: 'machine', name: '胸部支撑划船', m: '上背', sets: 3, reps: '10–12', rest: 90,
      cues: ['胸贴垫固定，减少腰代偿', '拉向髋部，顶峰夹背'] }),
    ex({ id: 'b_1arm', equip: 'dumbbell', name: '单臂哑铃划船', m: '背厚', sets: 3, reps: '10–12', rest: 90,
      cues: ['拉向髋部，肘贴身后拉', '顶峰挤压，离心拉伸'] }),
    ex({ id: 'b_seal', equip: 'barbell', name: '海豹划船', m: '中背', sets: 3, reps: '10–12', rest: 90,
      sub: '胸贴垫支撑',
      cues: ['俯卧于海豹凳，胸贴垫固定躯干', '拉向胸腹，肩胛后缩夹背', '纯背发力，腰不代偿'] }),
    ex({ id: 'b_deadlift', equip: 'barbell', name: '传统硬拉', m: '后链/背', sets: 3, reps: '5–8', rest: 180,
      cues: ['杠贴小腿，背平直', '髋膝同步伸展，顶峰不过度伸展'] }),
    ex({ id: 'b_rdl', equip: 'barbell', name: '罗马尼亚硬拉', m: '后链/腘绳', sets: 3, reps: '8–10', rest: 120,
      cues: ['髋铰链主导，膝微屈', '杠沿腿下滑，感受腘绳拉伸'] }),
    ex({ id: 'b_ext', equip: 'bodyweight', name: '山羊挺身', m: '竖脊/下背', sets: 3, reps: '12–15', rest: 75,
      sub: '自重 / 可抱杠片',
      cues: ['髋铰链主导，背中立', '顶峰不过度伸展，臀腿协同'] }),
    ex({ id: 'b_face', equip: 'cable', name: '绳索面拉', m: '后束/外旋', sets: 3, reps: '15–20', rest: 60, rir: '1',
      cues: ['绳高于头，拉向脸两侧', '肘必须高于腕，终点外旋夹肩胛', '体态关键动作，宁轻勿重'] }),
    ex({ id: 'b_revfly', equip: 'machine', name: '反向飞鸟', m: '后束', sets: 3, reps: '12–15', rest: 60, rir: '1',
      cues: ['俯身或器械，肘微屈', '后束挤压，肩胛下沉'] }),
    ex({ id: 'b_pullover', equip: 'single', name: '哑铃仰卧上拉', m: '背阔/胸', sets: 3, reps: '10–12', rest: 90,
      cues: ['上背贴凳，哑铃过头拉伸', '用背阔拉过胸线，肘微屈固定'] }),
    ex({ id: 'b_shrug', equip: 'barbell', name: '杠铃耸肩', m: '斜方', sets: 3, reps: '12–15', rest: 75,
      cues: ['直上直下耸肩，不滚肩', '顶峰停一秒，慢放'] }),
    ex({ id: 'b_meadows', equip: 'plateloaded', name: '梅多斯划船', m: '背厚', sets: 3, reps: '10–12', rest: 90,
      cues: ['单臂 T 杠，身体略旋转', '拉向髋部，顶峰挤压背阔'] }),
    ex({ id: 'b_closepulldown', equip: 'cable', name: '窄握高位下拉', m: '背阔/中下', sets: 3, reps: '10–12', rest: 90,
      cues: ['对握或窄握，拉向胸骨', '肩胛下沉，背阔主导，少用手臂'] }),
    ex({ id: 'b_rackpull', equip: 'barbell', name: '架上硬拉', m: '背/后链', sets: 3, reps: '5–8', rest: 150,
      cues: ['杠在膝上启动，减少行程', '背平直，髋伸展锁定'] }),
    ex({ id: 'b_pendlay', equip: 'barbell', name: '潘德雷划船', m: '背厚', sets: 3, reps: '6–8', rest: 120,
      cues: ['每 rep 杠触地复位', '爆发拉向胸腹，背中立'] })
  ],
  shoulders: [
    ex({ id: 'sh_ohp', equip: 'barbell', name: '杠铃过头推举', m: '肩', sets: 4, reps: '6–8', rest: 150,
      cues: ['核心收紧，臀腹发力', '杠过头顶锁定，核心收紧'] }),
    ex({ id: 'sh_dbpress', equip: 'dumbbell', name: '哑铃肩推', m: '肩', sets: 3, reps: '8–12', rest: 120,
      cues: ['坐姿或站姿，肩胛下沉', '推起不撞铃，离心控制'] }),
    ex({ id: 'sh_arnold', equip: 'dumbbell', name: '阿诺德推举', m: '肩', sets: 3, reps: '10–12', rest: 90,
      cues: ['旋转轨迹，全程肩主导', '底部掌心朝己，顶部朝前'] }),
    ex({ id: 'sh_latraise', equip: 'dumbbell', name: '哑铃侧平举', m: '侧束', sets: 3, reps: '12–15', rest: 60, rir: '1',
      cues: ['微屈肘，抬至肩高', '小指略高，避免耸肩借力'] }),
    ex({ id: 'sh_cableraise', equip: 'cable', name: '绳索侧平举', m: '侧束', sets: 3, reps: '12–15', rest: 60, rir: '1',
      cues: ['低位绳索，持续张力', '顶峰停一秒，慢放'] }),
    ex({ id: 'sh_reardelt', equip: 'dumbbell', name: '俯身哑铃后束飞鸟', m: '后束', sets: 3, reps: '12–15', rest: 60, rir: '1',
      cues: ['俯身背平，肘微屈外展', '后束挤压，宁轻勿重'] }),
    ex({ id: 'sh_upright', equip: 'barbell', name: '直立划船', m: '肩/斜方', sets: 3, reps: '10–12', rest: 90,
      cues: ['握距略宽于肩，拉到胸上沿即可', '肘高于腕，肩不适则换侧平举', '避免耸肩借力'] }),
    ex({ id: 'sh_frontraise', equip: 'dumbbell', name: '前平举', m: '前束', sets: 3, reps: '12–15', rest: 60, rir: '1',
      cues: ['交替或同时，抬至肩高', '核心稳定，躯干不后仰'] }),
    ex({ id: 'sh_machinepress', equip: 'machine', name: '器械肩推', m: '肩', sets: 3, reps: '10–12', rest: 90,
      cues: ['肩胛贴靠，推起不锁死', '离心控制，核心收紧'] }),
    ex({ id: 'sh_bentlat', equip: 'dumbbell', name: '俯身侧平举', m: '后束/侧束', sets: 3, reps: '12–15', rest: 60, rir: '1',
      cues: ['俯身背平，侧平举轨迹', '后束主导，宁轻勿重'] })
  ],
  biceps: [
    ex({ id: 'ar_bbcurl', equip: 'barbell', name: '杠铃弯举', m: '二头', sets: 4, reps: '10–12', rest: 90,
      cues: ['上臂固定不动，靠肘屈发力', '全程不借腰，慢起慢放'] }),
    ex({ id: 'ar_dbcurl', equip: 'dumbbell', name: '哑铃弯举', m: '二头', sets: 3, reps: '10–12', rest: 75,
      cues: ['交替或同时，顶峰旋转', '上臂贴身，不摆动'] }),
    ex({ id: 'ar_hammer', equip: 'dumbbell', name: '锤式弯举', m: '肱肌/前臂', sets: 3, reps: '12', rest: 60,
      cues: ['中立握，感受前臂外侧', '节奏稳定，可交替或同时'] }),
    ex({ id: 'ar_preacher', equip: 'ezbar', name: '牧师凳弯举', m: '二头（短头）', sets: 3, reps: '12', rest: 75,
      cues: ['上臂贴垫，底部不松到底', '离心慢放感受拉伸'] }),
    ex({ id: 'ar_cablecurl', equip: 'cable', name: '绳索弯举', m: '二头', sets: 3, reps: '12–15', rest: 60, rir: '1',
      cues: ['全程持续张力，不借力', '顶峰挤压一秒'] }),
    ex({ id: 'ar_concurl', equip: 'dumbbell', name: '集中弯举', m: '二头峰', sets: 3, reps: '12–15', rest: 60, rir: '1',
      cues: ['肘抵膝内侧固定', '顶峰旋转挤压，离心慢放'] }),
    ex({ id: 'ar_inclinecurl', equip: 'dumbbell', name: '上斜哑铃弯举', m: '二头长头', sets: 3, reps: '10–12', rest: 75,
      cues: ['上斜位手臂自然下垂', '长头拉伸充分再弯举'] }),
    ex({ id: 'ar_ezcurl', equip: 'ezbar', name: 'EZ 杠弯举', m: '二头', sets: 3, reps: '10–12', rest: 75,
      cues: ['握距舒适，上臂固定', '顶峰不耸肩，离心慢放'] }),
    ex({ id: 'ar_spider', equip: 'ezbar', name: '蜘蛛弯举', m: '二头峰', sets: 3, reps: '10–12', rest: 75, rir: '1',
      cues: ['上臂垂直地面贴垫', '顶峰挤压，全程张力'] }),
    ex({ id: 'ar_21s', equip: 'ezbar', name: '21 响炮弯举', m: '二头', sets: 2, reps: '21', rest: 90, rir: '0–1',
      cues: ['下半程 7 + 上半程 7 + 全程 7', '轻重量，泵感为主'] })
  ],
  triceps: [
    ex({ id: 'ar_pushdn', equip: 'cable', name: '横杆下压', m: '三头', sets: 3, reps: '12', rest: 75,
      cues: ['上臂贴身，下压到底锁定', '峰值停一秒，离心控制'] }),
    ex({ id: 'ar_rope', equip: 'cable', name: '绳索下拉', m: '三头', sets: 3, reps: '12–15', rest: 60, rir: '1',
      cues: ['到底两侧分绳外旋', '持续张力，不借肩'] }),
    ex({ id: 'ar_ropeoh', equip: 'cable', name: '绳索过头臂屈伸', m: '三头长头', sets: 3, reps: '10–15', rest: 80,
      cues: ['背对龙门架，绳索过头', '肘朝前固定，纯三头伸展', '顶峰不锁死肘，离心慢放'] }),
    ex({ id: 'ar_skull', equip: 'barbell', name: '杠铃仰卧臂屈伸', m: '三头长头', sets: 3, reps: '10–12', rest: 90,
      cues: ['肘位固定指向天花板', '下放过头加深长头拉伸'] }),
    ex({ id: 'ar_ohext', equip: 'single', name: '哑铃过头臂屈伸', m: '三头长头', sets: 3, reps: '10–12', rest: 75,
      cues: ['单臂或双手，肘朝前固定', '过头位充分拉伸长头'] }),
    ex({ id: 'ar_cgbench', equip: 'barbell', name: '窄握卧推', m: '三头', sets: 3, reps: '8–10', rest: 120,
      cues: ['握距窄于肩，肘贴身', '下放至胸，三头主导推起'] }),
    ex({ id: 'ar_dip', equip: 'bodyweight', name: '双杠臂屈伸', m: '三头/下胸', sets: 3, reps: '8–12', rest: 90, sub: '自重 / 可负重',
      cues: ['竖直偏三头，前倾偏胸', '下放至肩略低于肘，肩胛保持稳定'] }),
    ex({ id: 'ar_benchdip', equip: 'bodyweight', name: '凳上臂屈伸', m: '三头', sets: 3, reps: '10–15', rest: 60, sub: '自重 / 可负重',
      cues: ['身后凳支撑，肘向后屈', '下放至肘约 90°，肩胛保持稳定'] }),
    ex({ id: 'ar_kickback', equip: 'dumbbell', name: '哑铃后踢', m: '三头', sets: 3, reps: '12–15', rest: 60, rir: '1',
      cues: ['俯身上臂平行地面固定', '伸直锁定，顶峰挤压'] }),
    ex({ id: 'ar_jmpress', equip: 'barbell', name: 'JM 卧推', m: '三头', sets: 3, reps: '8–10', rest: 90,
      cues: ['窄握，杠落胸上沿附近', '三头主导，肘向前'] }),
    ex({ id: 'ar_french', equip: 'ezbar', name: '法式推举', m: '三头长头', sets: 3, reps: '10–12', rest: 75,
      cues: ['EZ 杠或哑铃过头', '肘朝前固定，纯三头伸展'] })
  ],
  legs: [
    ex({ id: 'l_squat', equip: 'barbell', name: '杠铃深蹲', m: '股四/臀', sets: 4, reps: '8–12', rest: 180,
      cues: ['全程核心收紧，背部中立', '下蹲至大腿平行或更低', '膝盖跟脚尖方向一致'] }),
    ex({ id: 'l_frontsquat', equip: 'barbell', name: '前蹲', m: '股四', sets: 3, reps: '8–10', rest: 150,
      cues: ['高肘位，躯干更直立', '下蹲深度够，膝不内扣'] }),
    ex({ id: 'l_goblet', equip: 'single', name: '高脚杯深蹲', m: '股四/臀', sets: 3, reps: '12–15', rest: 90,
      cues: ['哑铃抱胸，肘撑膝', '下蹲居中，脚跟贴地'] }),
    ex({ id: 'l_hack', equip: 'machine', name: '背式哈克深蹲', m: '股四', sets: 3, reps: '12', rest: 150,
      cues: ['脚位偏低重股四，膝不内扣', '下放充分，顶端微屈膝'] }),
    ex({ id: 'l_press', equip: 'machine', name: '倒蹬机', m: '股四/臀', sets: 3, reps: '12', rest: 120,
      cues: ['脚位中等，膝不锁死', '下放至膝约 90°，控制离心'] }),
    ex({ id: 'l_ext', equip: 'machine', name: '坐姿腿屈伸', m: '股四孤立', sets: 3, reps: '12–15', rest: 75, rir: '1',
      cues: ['顶部停一秒，慢放', '纯股四发力，控制节奏'] }),
    ex({ id: 'l_sissy', equip: 'bodyweight', name: '西斯深蹲', m: '股四', sets: 3, reps: '10–12', rest: 90, sub: '自重 / 可扶',
      cues: ['膝前移，躯干直立', '控制离心，股四灼烧感'] }),
    ex({ id: 'l_rdl', equip: 'barbell', name: '罗马尼亚硬拉', m: '腘绳/臀', sets: 3, reps: '8–10', rest: 120,
      cues: ['髋铰链，膝微屈', '杠沿腿滑，腘绳拉伸'] }),
    ex({ id: 'l_curl', equip: 'machine', name: '坐姿腿弯举', m: '腘绳', sets: 3, reps: '12', rest: 90,
      cues: ['顶峰收缩挤压，离心控制', '髋贴稳坐垫'] }),
    ex({ id: 'l_sldl', equip: 'barbell', name: '直腿硬拉', m: '腘绳', sets: 3, reps: '10–12', rest: 90,
      cues: ['膝几乎伸直，髋后推', '下放至腘绳紧绷'] }),
    ex({ id: 'l_thrust', equip: 'barbell', name: '负重臀桥', m: '臀', sets: 3, reps: '12', rest: 120,
      cues: ['顶部夹臀停一秒', '下巴微收，肋骨内收'] }),
    ex({ id: 'l_hipthrust_mc', equip: 'machine', name: '器械臀推', m: '臀', sets: 3, reps: '12–15', rest: 90,
      cues: ['肩胛靠垫，下巴微收', '顶峰夹臀，离心控制'] }),
    ex({ id: 'l_lunge', equip: 'dumbbell', name: '哑铃弓步蹲', m: '股四/臀', sets: 3, reps: '10–12/腿', rest: 90,
      cues: ['步幅够大，膝不过脚尖过多', '躯干直立，交替或单腿'] }),
    ex({ id: 'l_bulgarian', equip: 'dumbbell', name: '保加利亚分腿蹲', m: '股四/臀', sets: 3, reps: '10–12/腿', rest: 90,
      cues: ['后脚垫高，前腿主导', '下蹲深度够，膝稳定'] }),
    ex({ id: 'l_abd', equip: 'machine', name: '器械髋外展', m: '臀中/小', sets: 3, reps: '15', rest: 60, rir: '1',
      cues: ['上身略前倾，外展到顶停顿', '慢放，感受臀外侧'] }),
    ex({ id: 'l_calf', equip: 'machine', name: '站姿提踵', m: '小腿', sets: 4, reps: '12–15', rest: 60, rir: '1',
      cues: ['全程幅度，底部拉伸', '顶峰停一秒，慢放'] }),
    ex({ id: 'l_seatedcalf', equip: 'machine', name: '坐姿提踵', m: '比目鱼肌', sets: 3, reps: '15–20', rest: 60, rir: '1',
      cues: ['膝屈位，刺激比目鱼肌', '幅度做满，控制节奏'] }),
    ex({ id: 'l_smithsquat', equip: 'smith', name: '史密斯深蹲', m: '股四/臀', sets: 3, reps: '8–12', rest: 150,
      cues: ['脚位略前，杠路固定', '下蹲深度够，膝跟脚尖同向'] }),
    ex({ id: 'l_stepup', equip: 'dumbbell', name: '箱式踏步', m: '股四/臀', sets: 3, reps: '10–12/腿', rest: 90,
      cues: ['箱高适中，全脚掌踩实', '推起时臀腿主导，避免弹起借力'] }),
    ex({ id: 'l_goodmorning', equip: 'barbell', name: '早安式', m: '腘绳/下背', sets: 3, reps: '8–10', rest: 120,
      cues: ['杠背高位，髋铰链主导', '背平直，幅度可控，背保持平直'] }),
    ex({ id: 'l_nordic', equip: 'bodyweight', name: '北欧腿弯举', m: '腘绳', sets: 3, reps: '6–10', rest: 90, sub: '自重 / 可辅助',
      cues: ['膝固定，身体缓慢前倾', '腘绳离心控制，可手推辅助回位'] }),
    ex({ id: 'l_adductor', equip: 'machine', name: '坐姿内收', m: '内收肌', sets: 3, reps: '12–15', rest: 60, rir: '1',
      cues: ['上身稳定，腿内收夹紧', '顶峰停一秒，慢放'] }),
    ex({ id: 'l_walkinglunge', equip: 'dumbbell', name: '行走弓步', m: '股四/臀', sets: 3, reps: '12/腿', rest: 90,
      cues: ['步幅够大，躯干直立', '后膝可轻触地，交替前进'] })
  ],
  core: [
    ex({ id: 'co_hlr', equip: 'bodyweight', name: '悬垂举腿', m: '下腹', sets: 4, reps: '10–15', rest: 75, sub: '自重 / 可夹哑铃',
      cues: ['先后倾骨盆再卷腿，用腹不用髋屈肌', '上举呼气顶峰挤压，下放慢控不晃'] }),
    ex({ id: 'co_cablecrunch', equip: 'cable', name: '绳索跪姿卷腹', m: '上腹', sets: 4, reps: '12–15', rest: 60,
      cues: ['绳挂颈后，髋固定不动', '靠卷脊柱把肋骨拉向骨盆'] }),
    ex({ id: 'co_rollout', equip: 'bodyweight', name: '健腹轮推出', m: '抗伸展', sets: 3, reps: '8–12', rest: 75, sub: '跪姿起步',
      cues: ['全程收紧核心，骨盆后倾', '推到可控极限再用腹收回'] }),
    ex({ id: 'co_cablerollout', equip: 'cable', name: '绳索跪姿推出', m: '抗伸展', sets: 3, reps: '10–12', rest: 75, rir: '1',
      cues: ['跪姿握绳，髋肩固定', '靠腹直肌收回，不塌腰'] }),
    ex({ id: 'co_woodchop', equip: 'cable', name: '绳索斜砍', m: '腹斜肌', sets: 3, reps: '12–15/侧', rest: 60, rir: '1',
      cues: ['转动来自躯干而非手臂', '收紧核心控制离心回位'] }),
    ex({ id: 'co_russiantwist', equip: 'bodyweight', name: '俄罗斯转体', m: '腹斜肌', sets: 3, reps: '12–15/侧', rest: 60, rir: '1',
      sub: '自重 / 可持杠片',
      cues: ['坐姿或半躺，脚可离地', '转动来自胸椎，手臂仅持重不参与'] }),
    ex({ id: 'co_plank', equip: 'bodyweight', name: '平板支撑', m: '核心稳定', sets: 3, reps: '40–60s', rest: 45, rir: '0–1', sub: '自重 / 可负重',
      cues: ['臀腹同时收紧成一条直线', '身体成一条直线，呼吸均匀'] }),
    ex({ id: 'co_pallof', equip: 'cable', name: '抗旋转推举', m: '核心抗旋', sets: 3, reps: '12–15/侧', rest: 60,
      cues: ['绳索横拉，躯干对抗旋转', '核心收紧，髋肩稳定'] }),
    ex({ id: 'co_sideplank', equip: 'bodyweight', name: '侧平板支撑', m: '腹斜肌', sets: 3, reps: '30–45s/侧', rest: 45, rir: '0–1', sub: '自重',
      cues: ['髋肩一条线，核心收紧', '可屈膝降低难度'] }),
    ex({ id: 'co_crunch', equip: 'machine', name: '卷腹机', m: '上腹', sets: 3, reps: '12–15', rest: 60,
      cues: ['下巴微收，肋骨向骨盆卷', '用腹肌发力，不拉脖子'] }),
    ex({ id: 'co_bwcrunch', equip: 'bodyweight', name: '自重卷腹', m: '上腹', sets: 3, reps: '15–20', rest: 60, rir: '1',
      cues: ['下背贴地，肋骨向骨盆卷', '顶峰挤压，离心慢放'] }),
    ex({ id: 'co_hangingknee', equip: 'bodyweight', name: '悬垂屈膝抬腿', m: '下腹', sets: 3, reps: '10–15', rest: 75, sub: '自重',
      cues: ['先后倾骨盆再抬膝', '控制摆动，不用惯性'] }),
    ex({ id: 'co_deadbug', equip: 'bodyweight', name: '死虫式', m: '核心稳定', sets: 3, reps: '10/侧', rest: 45,
      cues: ['下背贴地，对侧手脚缓慢伸展', '腰离地就缩小幅度'] })
  ]
};

/** @type {Record<string, ExerciseDef>} */
export const EX_BY_ID = Object.fromEntries(
  Object.values(EX_GROUPS).flat().map((e) => [e.id, e])
);

/** 旧动作 id → 新 id（本地状态迁移用） */
export const EX_ID_ALIASES = {
  c_dip: 'ar_dip',
  sh_facepull_iso: 'b_face'
};

for (const [oldId, newId] of Object.entries(EX_ID_ALIASES)) {
  if (EX_BY_ID[newId] && !EX_BY_ID[oldId]) {
    EX_BY_ID[oldId] = EX_BY_ID[newId];
  }
}

/** @param {string} id */
export function resolveExerciseId(id) {
  return EX_ID_ALIASES[id] ?? id;
}

/** 同一动作的新旧 id（统计 / 历史合并用） */
export function exerciseIdVariants(id) {
  const canonical = resolveExerciseId(id);
  const variants = new Set([canonical, id]);
  for (const [oldId, newId] of Object.entries(EX_ID_ALIASES)) {
    if (newId === canonical) variants.add(oldId);
  }
  return [...variants];
}

/** 各训练日可浏览的肌群池（用于编辑页「可选动作库」） */
export const DAY_POOL_GROUPS = {
  chest: ['chest', 'shoulders'],
  back: ['back', 'shoulders'],
  arms: ['biceps', 'triceps'],
  legs: ['legs'],
  core: ['core'],
  delts: ['shoulders', 'back'],
  office: [],
  morning: [],
  upper_a: ['chest', 'shoulders', 'triceps'],
  upper_b: ['back', 'biceps', 'triceps', 'shoulders'],
  lower_a: ['legs'],
  lower_b: ['legs'],
  push_a: ['chest', 'shoulders', 'triceps'],
  push_b: ['chest', 'shoulders', 'triceps'],
  pull_a: ['back', 'biceps', 'shoulders'],
  pull_b: ['back', 'biceps', 'shoulders'],
  legs_a: ['legs'],
  legs_b: ['legs'],
  full_a: ['chest', 'back', 'legs', 'biceps', 'triceps'],
  full_b: ['chest', 'back', 'legs', 'biceps', 'triceps'],
  full_c: ['chest', 'back', 'legs', 'biceps', 'triceps']
};

/**
 * @param {string} dayId
 * @returns {ExerciseDef[]}
 */
export function getPoolExercisesForDay(dayId) {
  const groups = DAY_POOL_GROUPS[dayId] || [];
  const seen = new Set();
  /** @type {ExerciseDef[]} */
  const out = [];
  for (const g of groups) {
    for (const exDef of EX_GROUPS[g] || []) {
      if (!seen.has(exDef.id)) {
        seen.add(exDef.id);
        out.push(exDef);
      }
    }
  }
  return out;
}

/**
 * @param {string} id
 * @param {Partial<ExerciseDef>} [patch]
 * @returns {ExerciseDef}
 */
export function broEx(id, patch = {}) {
  const base = EX_BY_ID[id];
  if (!base) throw new Error(`Unknown exercise: ${id}`);
  return { ...base, ...patch };
}

/**
 * @param {(string | { id: string } & Partial<ExerciseDef>)[]} specs
 * @param {Record<string, Partial<ExerciseDef>>} [patches]
 */
export function pickExSpecs(specs, patches = {}) {
  return specs
    .map((s) => {
      if (typeof s === 'string') return broEx(s, patches[s] || {});
      const { id, ...patch } = s;
      return broEx(id, { ...(patches[id] || {}), ...patch });
    })
    .filter(Boolean);
}
