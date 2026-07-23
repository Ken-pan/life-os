# Kenos Train 动作示范图生成 Prompts（P0 批次 · v3）

补齐四套计划日缺图的 12 个力量动作。风格基准 = `static/assets/images/exercises/*.jpg` 现有 33 张已验收图。

## 核心方法：图锚定，不靠文字修比例

> v1/v2 教训：想用文字（"tall / long legs / do not elongate torso / 85% frame height"）纠正身高比例，是生图提示词的反模式——模型对否定词遵从差、对数字不量化执行，越修越歪。
> **正确做法：每次生成附一张同体位的已验收标准图，让模型复制它的机位/比例/光线，文字只负责换动作。**

### 每次生成附 2 张参考图

1. **图1 = 角色脸部参考**：教练正面清晰照（黑底角色照，脸大而清晰的那张）。
2. **图2 = 同体位构图锚**：从已验收 33 张里按体位选，见下表。

| 体位 | 待生成动作 | 构图锚（已验收图） |
|---|---|---|
| A 站姿 | sh_latraise · sh_cableraise · ar_ezcurl · ar_ropeoh · l_calf | `ar_bbcurl.jpg`（绳索类可换 `ar_pushdn.jpg`） |
| B 俯身/髋铰链 | sh_reardelt · b_chestsup | `b_1arm.jpg` |
| B 俯身（杠铃） | l_rdl | `l_squat.jpg` |
| C 卧姿 | c_dbpress · ar_cgbench | `c_bench.jpg` |
| D 坐姿 | sh_dbpress · b_revfly | `l_ext.jpg`（推举类可换 `c_decmc.jpg`） |

### Prompt 模板（逐字复用，只换【动作段】）

```
Use the two attached reference photos. Image 1 is the athlete — keep his exact face,
hair, and physique. Image 2 is the style and framing reference — match its camera
height, camera angle, lens compression, subject-to-camera distance, body proportions,
lighting, and color grade exactly. Same dark moody power gym, all-black equipment,
deep black background, low-key dramatic side light with subtle rim light.

Change only the exercise. 【动作段】

He is shirtless in plain black athletic shorts, black crew socks, black training
shoes — all gear unbranded, no logos or text anywhere in the image. Hyper-realistic
skin with sweat sheen, dense dark chest hair, visible veins. Professional fitness
photography, sharp focus, landscape 3:2.
```

要点：动作段**只写姿势、器械、发力细节**，一律不写 full body / centered / wide / view / 比例 / 身高——构图全部交给图2锚定。

## P0 动作段

### sh_latraise 哑铃侧平举 · 锚 ar_bbcurl
```
He performs a standing dumbbell lateral raise: upright stance, a black hex dumbbell in each hand, both arms raised out to the sides to shoulder height with a slight elbow bend, palms down, side delts contracted, gaze forward.
```

### sh_cableraise 绳索侧平举 · 锚 ar_pushdn
```
He performs a single-arm cable lateral raise: standing beside a black cable column, working arm raised out to the side to shoulder height gripping the handle, cable running across his body from the low pulley, other hand resting on the frame.
```

### sh_reardelt 俯身哑铃后束飞鸟 · 锚 b_1arm
```
He performs a bent-over rear delt fly: hips hinged, flat back close to parallel with the floor, a black hex dumbbell in each hand, arms raised out wide with a slight elbow bend, rear delts squeezed, gaze down, seen from the side.
```

### b_revfly 反向飞鸟（器械） · 锚 l_ext
```
He performs a reverse fly on a black pec-deck machine, seated facing the pad, chest against it, arms swept out wide gripping the vertical handles, rear delts and upper back at peak contraction, seen from behind at a three-quarter angle.
```

### sh_dbpress 哑铃肩推 · 锚 c_decmc
```
He performs a seated dumbbell shoulder press on an upright black bench: both black hex dumbbells locked out overhead, arms extended, delts contracted, core braced, gaze forward, seen from a front three-quarter angle.
```

### c_dbpress 哑铃平板卧推 · 锚 c_bench
```
He performs a flat dumbbell bench press lying on a black bench: both black hex dumbbells pressed to lockout above his chest, chest contracted, feet planted on the floor, seen from the side.
```

### b_chestsup 胸部支撑划船 · 锚 b_1arm
```
He performs a chest-supported dumbbell row on a black incline bench: chest against the angled pad, rowing both dumbbells toward his hips, elbows driven back, lats and mid-back contracted, shoulder blades squeezed, seen from a rear three-quarter angle.
```

### ar_cgbench 窄握卧推 · 锚 c_bench
```
He performs a close-grip barbell bench press inside a black power rack: hands on the black barbell at shoulder width, bar locked out above his chest, triceps tensed, feet planted, seen from the side with the narrow grip clearly visible.
```

### ar_ezcurl EZ 杠弯举 · 锚 ar_bbcurl
```
He performs a standing EZ-bar curl: black EZ curl bar at the top of the curl, biceps at peak contraction, elbows pinned to his sides, forearm veins prominent, gaze forward.
```

### ar_ropeoh 绳索过头臂屈伸 · 锚 ar_pushdn
```
He performs an overhead cable rope triceps extension: facing away from the black cable column in a staggered stance with a slight forward lean, both hands gripping the rope behind his head, elbows up and forward, triceps stretched at the bottom of the rep, seen from the side.
```

### l_rdl 罗马尼亚硬拉 · 锚 l_squat
```
He performs a Romanian deadlift: hips hinged back, flat neutral spine, black barbell with black plates at mid-shin height, knees slightly bent, hamstrings and glutes loaded, gaze down-forward, seen from the side with the hip hinge clearly visible.
```

### l_calf 站姿提踵 · 锚 ar_bbcurl
```
He performs a standing calf raise on a black calf raise machine: shoulders under the pads, balls of his feet on the platform, heels lifted at the top of the rep, calves fully contracted, seen from behind at a three-quarter angle.
```

## 验收清单（每张图过一遍）

- [ ] 脸 = 角色参考（不像 → 直接重 roll，不改 prompt）
- [ ] 躯干/腿比例 = 构图锚（歪了 → 检查是否漏附图2，或换更贴近的锚图重试）
- [ ] 动作形态是教科书标准（握距/关节角度/器械对）
- [ ] 手指数量、握姿正常
- [ ] **无任何 logo/文字**（袜、鞋、短裤、器械上都不能有）
- [ ] 光线暗调一致，背景够黑
- [ ] 3:2 横幅 1536×1024

通过 → 存为 `<id>.jpg` 放入 `static/assets/images/exercises/`，并把 id 追加进 `src/lib/data/program.js` 的 `DEDICATED_EX_IMAGE_IDS`。

## P1（可选池高频动作，同法炮制）

b_deadlift 硬拉（锚 l_squat）· b_bbrow 杠铃俯身划船（锚 l_squat）· sh_ohp 杠铃过头推举（锚 ar_bbcurl）· l_lunge 弓步蹲（锚 ar_bbcurl）· l_bulgarian 保加利亚分腿蹲（锚 ar_bbcurl）· c_pushup 俯卧撑（锚 co_rollout）· b_shrug 杠铃耸肩（锚 ar_bbcurl）· l_seatedcalf 坐姿提踵（锚 l_ext）

## 待决定

- `mo_*` 热身/灵活性 12 个动作是否也出图（徒手拉伸，风格可能要更明亮/中性，单独决定）。
- `c_dip.jpg` 是孤儿文件（未登记 `DEDICATED_EX_IMAGE_IDS`，双杠臂屈伸映射的是 `ar_dip`），可删或登记。
- 已发现新图袜/鞋带 Nike logo——商用风险，模板已封（unbranded / no logos），旧的已验收图里如有也建议排查。
