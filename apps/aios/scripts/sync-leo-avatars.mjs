#!/usr/bin/env node
/**
 * Sync Leo Kuft faces + curated scene stills → apps/aios/static/leo/
 * Source: fitness gpt-image-runner character pack.
 *
 * Avatars → static/leo/*.png (192px, chat bubbles)
 * Scenes  → static/leo/scenes/*.png (720px, moment picker / presence)
 * Pet     → static/leo/pet/*.png (512px, desktop companion)
 *
 * Missing source files are skipped (LocalAI/fal batch may still be running).
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pack = join(
  root,
  '../fitness/tools/gpt-image-runner/character/leo_kuft',
)
const destDir = join(root, 'static/leo')
const scenesDir = join(destDir, 'scenes')
const petDir = join(destDir, 'pet')

/** @type {ReadonlyArray<[string, string]>} */
const AVATARS = [
  ['identity/face_front_neutral.png', 'neutral.png'],
  ['identity/face_smile.png', 'smile.png'],
  ['identity/face_frown.png', 'serious.png'],
  ['identity/face_chin_hand.png', 'soft.png'],
  ['identity/face_thinking.png', 'thinking.png'],
]

/**
 * Keep in sync with leoStills.core.js ids.
 * @type {ReadonlyArray<[string, string]>}
 */
const SCENES = [
  ['lifestyle/sf02_home_selfie.png', 'home.png'],
  ['lifestyle/sf04_post_workout_selfie.png', 'gym.png'],
  ['lifestyle/sf01_mirror_gym.png', 'mirror.png'],
  ['lifestyle/sf03_outdoor_selfie.png', 'outdoor.png'],
  ['lifestyle/sc03_wave_hello.png', 'hello.png'],
  ['lifestyle/lf03_couch_cozy.png', 'couch.png'],
  ['lifestyle/lf04_reading_bed.png', 'night.png'],
  ['lifestyle/lf07_night_text.png', 'night_text.png'],
  ['lifestyle/lf05_cafe.png', 'cafe.png'],
  ['lifestyle/lf02_cooking.png', 'cook.png'],
  ['lifestyle/lf06_walk_street.png', 'walk.png'],
  ['lifestyle/lf08_rain_window.png', 'rain.png'],
  ['lifestyle/sc06_park_bench.png', 'park.png'],
  ['lifestyle/sc07_gaming_couch.png', 'game.png'],
  ['lifestyle/fy01_coffee_for_you.png', 'coffee.png'],
  ['lifestyle/fy02_cooking_for_you.png', 'plate.png'],
  ['lifestyle/fy03_show_phone.png', 'phone.png'],
  ['lifestyle/fy04_hand_reach.png', 'hand.png'],
  ['lifestyle/sc04_listening.png', 'listen.png'],
  ['lifestyle/ot02_shirt_date.png', 'date.png'],
  ['lifestyle/ot01_hoodie.png', 'hoodie.png'],
  ['lifestyle/ot04_good_night.png', 'goodnight.png'],
  ['lifestyle/sc01_shower_steam.png', 'shower.png'],
  ['lifestyle/sc02_locker_room.png', 'locker.png'],
  ['lifestyle/sc05_laugh.png', 'laugh.png'],
  ['persona/p10_tender.png', 'tender.png'],
  ['persona/p04_smug.png', 'smug.png'],
  ['persona/p13_sleepy.png', 'sleepy.png'],
]

/** Keep in sync with leoPet.core.js */
/** @type {ReadonlyArray<[string, string]>} */
const PETS = [
  ['pet/idle_a.png', 'idle_a.png'],
  ['pet/idle_b.png', 'idle_b.png'],
  ['pet/wave.png', 'wave.png'],
  ['pet/think.png', 'think.png'],
  ['pet/listen.png', 'listen.png'],
  ['pet/happy.png', 'happy.png'],
  ['pet/busy.png', 'busy.png'],
  ['pet/sleep.png', 'sleep.png'],
  ['pet/soft.png', 'soft.png'],
  ['pet/petted.png', 'petted.png'],
  ['pet/celebrate.png', 'celebrate.png'],
  ['pet/stretch.png', 'stretch.png'],
  ['pet/coffee.png', 'coffee.png'],
  ['pet/smirk.png', 'smirk.png'],
  ['pet/shake.png', 'shake.png'],
  ['pet/cook.png', 'cook.png'],
  ['pet/speak.png', 'speak.png'],
  ['pet/draw.png', 'draw.png'],
  ['pet/oops.png', 'oops.png'],
  ['pet/yawn.png', 'yawn.png'],
]

/**
 * @param {string} src
 * @param {string} dest
 * @param {number} maxEdge
 */
function syncOne(src, dest, maxEdge) {
  copyFileSync(src, dest)
  spawnSync('sips', ['-Z', String(maxEdge), dest, '--out', dest], {
    stdio: 'ignore',
  })
}

mkdirSync(destDir, { recursive: true })
mkdirSync(scenesDir, { recursive: true })
mkdirSync(petDir, { recursive: true })

let ok = 0
let skip = 0
for (const [from, to] of AVATARS) {
  const src = join(pack, from)
  if (!existsSync(src)) {
    console.log(`skip avatar ${to} (missing ${from})`)
    skip++
    continue
  }
  syncOne(src, join(destDir, to), 192)
  console.log(`avatar ${to}`)
  ok++
}

for (const [from, to] of SCENES) {
  const src = join(pack, from)
  if (!existsSync(src)) {
    console.log(`skip scene ${to} (missing ${from})`)
    skip++
    continue
  }
  syncOne(src, join(scenesDir, to), 720)
  console.log(`scene ${to}`)
  ok++
}

for (const [from, to] of PETS) {
  const src = join(pack, from)
  if (!existsSync(src)) {
    console.log(`skip pet ${to} (missing ${from})`)
    skip++
    continue
  }
  syncOne(src, join(petDir, to), 512)
  console.log(`pet ${to}`)
  ok++
}

console.log(`\ndone ${ok} synced, ${skip} skipped`)
