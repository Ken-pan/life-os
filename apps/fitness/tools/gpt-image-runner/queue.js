// P0 批次任务队列 — 与 apps/fitness/docs/exercise-image-prompts.md v3 同源
// 每个 job：id = 动作 id（产出文件名）；anchor = 同体位构图锚（refs/ 内文件）；action = 动作段
// 完整 prompt = TEMPLATE_HEAD + action + TEMPLATE_TAIL（图1=三视图定身份，图2=锚图定构图）

const TEMPLATE_HEAD = `Use the two attached reference photos. Image 1 is a three-view turnaround of the athlete and is the single source of truth for his identity AND his body proportions: exact face, hair, physique, head-to-body ratio, torso length, and leg length — his legs are long, the crotch sits at just over half of his total height, as shown in the turnaround. Image 2 defines the photographic style only: match its camera height, camera angle, lens compression, lighting, color grade, and dark power gym environment — but ignore any body proportions implied by Image 2; proportions always come from Image 1.

Change only the exercise. `

const TEMPLATE_TAIL = `

He wears the same short black athletic shorts as in Image 1 (short inseam, hem high on the thigh), black crew socks, black training shoes — all gear unbranded, no logos or text anywhere in the image. Skin, muscle definition, and body hair exactly as in Image 1: hyper-realistic skin with a light sweat sheen, dense dark chest hair, natural leg hair, strong defined muscles with natural vascularity — no exaggerated striations. Professional fitness photography, sharp focus, landscape 3:2.`

export const JOBS = [
  {
    id: 'sh_latraise',
    name: '哑铃侧平举',
    anchor: 'ar_bbcurl.jpg',
    crop: 'kneeCrop',
    action: 'He performs a standing dumbbell lateral raise at the top of the rep: upright stance, a black hex dumbbell in each hand, both arms raised out to the sides to shoulder height with a clearly bent elbow, palms down, shoulders kept down away from the ears. The side deltoids are the visual focus — rounded, hard and clearly contracted, catching the key light.',
  },
  {
    id: 'sh_cableraise',
    name: '绳索侧平举',
    anchor: 'ar_pushdn.jpg',
    crop: 'kneeCrop',
    action: 'He performs a single-arm cable lateral raise: standing beside a black cable column, working arm raised out to the side to shoulder height gripping the handle, cable running across his body from the low pulley, other hand resting on the frame. The side deltoid of the working arm is the visual focus, rounded and clearly contracted.',
  },
  {
    id: 'sh_reardelt',
    name: '俯身后束飞鸟',
    anchor: 'b_1arm.jpg',
    action: 'He performs a bent-over rear delt fly: hips hinged, flat back close to parallel with the floor, a black hex dumbbell in each hand, arms raised out wide with a slight elbow bend, rear delts squeezed, gaze down, seen from the side.',
  },
  {
    id: 'b_revfly',
    name: '反向飞鸟（器械）',
    anchor: 'l_ext.jpg',
    action: 'He performs a reverse fly on a black pec-deck machine, seated facing the pad, chest against it, arms swept out wide gripping the vertical handles, rear delts and upper back at peak contraction, seen from behind at a three-quarter angle.',
  },
  {
    id: 'sh_dbpress',
    name: '哑铃肩推',
    anchor: 'c_decmc.jpg',
    action: 'He performs a seated dumbbell shoulder press on an upright black bench: both black hex dumbbells locked out overhead, arms extended, delts contracted, core braced, gaze forward, seen from a front three-quarter angle.',
  },
  {
    id: 'c_dbpress',
    name: '哑铃平板卧推',
    anchor: 'c_bench.jpg',
    action: 'He performs a flat dumbbell bench press lying on a black bench: both black hex dumbbells pressed to lockout above his chest, chest contracted, feet planted on the floor, seen from the side.',
  },
  {
    id: 'b_chestsup',
    name: '胸部支撑划船',
    anchor: 'b_1arm.jpg',
    action: 'He performs a chest-supported dumbbell row on a black incline bench: chest against the angled pad, rowing both dumbbells toward his hips, elbows driven back, lats and mid-back contracted, shoulder blades squeezed, seen from a rear three-quarter angle.',
  },
  {
    id: 'ar_cgbench',
    name: '窄握卧推',
    anchor: 'c_bench.jpg',
    action: 'He performs a close-grip barbell bench press inside a black power rack: hands on the black barbell at shoulder width, bar locked out above his chest, triceps tensed, feet planted, seen from the side with the narrow grip clearly visible.',
  },
  {
    id: 'ar_ezcurl',
    name: 'EZ 杠弯举',
    anchor: 'ar_bbcurl.jpg',
    crop: 'kneeCrop',
    action: 'He performs a standing EZ-bar curl: black EZ curl bar at the top of the curl, biceps at peak contraction, elbows pinned to his sides, forearm veins prominent, gaze forward.',
  },
  {
    id: 'ar_ropeoh',
    name: '绳索过头臂屈伸',
    anchor: 'ar_pushdn.jpg',
    crop: 'kneeCrop',
    action: 'He performs an overhead cable rope triceps extension: facing away from the black cable column in a staggered stance with a slight forward lean, both hands gripping the rope behind his head, elbows up and forward, triceps stretched at the bottom of the rep, seen from the side.',
  },
  {
    id: 'l_rdl',
    name: '罗马尼亚硬拉',
    anchor: 'l_squat.jpg',
    action: 'He performs a Romanian deadlift: hips hinged back, flat neutral spine, black barbell with black plates at mid-shin height, knees slightly bent, hamstrings and glutes loaded, gaze down-forward, seen from the side with the hip hinge clearly visible.',
  },
  {
    id: 'l_calf',
    name: '站姿提踵',
    anchor: 'ar_bbcurl.jpg',
    crop: 'lowerBody',
    action: 'He performs a standing calf raise on a black calf raise machine: shoulders under the pads, balls of his feet on the platform, heels lifted at the top of the rep, calves fully contracted, seen from behind at a three-quarter angle.',
  },
]

// 裁切规范：全身站姿在 3:2 横幅里模型有「压腿」顽固倾向,且现有图库本就没有整人站姿。
// 站姿类裁到膝下(避开腿长争议、与图库紧凑构图一致);提踵反过来以下肢为主体。
const CROP_DIRECTIVES = {
  kneeCrop:
    ' Framing: a tight three-quarter-length crop, cut off just below the knees, so the athlete fills the frame the way the existing library images do — do NOT show the full standing figure head-to-toe with floor and headroom.',
  lowerBody:
    ' Framing: a lower-body crop focused on the legs, cut off at the waist, so the calves and lower legs are the main subject filling the frame.',
}

export function buildPrompt(job) {
  const crop = job.crop ? CROP_DIRECTIVES[job.crop] || '' : ''
  return TEMPLATE_HEAD + job.action + crop + TEMPLATE_TAIL
}
