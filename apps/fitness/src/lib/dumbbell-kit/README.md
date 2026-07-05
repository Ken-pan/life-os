# Dumbbell Kit

A self-contained dumbbell renderer. Composes a dumbbell from **vector**
(procedurally rendered) plate / bar / collar sprites on an HTML canvas — unified
parametric plate shading with rounded corners, a knurled bar, and a crisp clamp.
No UI, no background switching, no image export — just the rendering logic and
the (baked) vector assets.

## What's inside

| File | Purpose |
| --- | --- |
| `sprites.data.ts` | The vector-rendered sprites baked as PNG data URIs (parametric plates, procedural bar/collar). No external files. |
| `dumbbell.ts` | Framework-agnostic renderer (Canvas 2D). `loadDumbbell()`, `drawDumbbell()`, `measure()`, `PLATE_KEYS`. |
| `Dumbbell.svelte` | Ready-to-use Svelte component wrapper. |

Copy the whole `dumbbell-kit/` folder into your Svelte app. The only dependency
is a browser canvas — nothing to install, no asset pipeline to configure.

## Svelte usage

```svelte
<script>
  import Dumbbell from "$lib/dumbbell-kit/Dumbbell.svelte";
</script>

<!-- plate: blue | green | yellow | black | grey | white -->
<Dumbbell plate="blue" perSide={3} />
<Dumbbell plate="green" perSide={5} scale={3} class="my-dumbbell" />
```

The canvas is transparent — put any background behind it with CSS.

## Plain usage (no framework)

```ts
import { loadDumbbell, drawDumbbell, measure } from "./dumbbell";

const assets = await loadDumbbell();               // loads + caches sprites once
const canvas = document.querySelector("canvas")!;
const ctx = canvas.getContext("2d")!;

const { width, height } = measure(assets, { plate: "blue", perSide: 3, scale: 2 });
canvas.width = width;
canvas.height = height;
drawDumbbell(ctx, assets, { plate: "blue", perSide: 3, scale: 2 });
```

## API

- `loadDumbbell(): Promise<LoadedAssets>` — decode + cache all sprites (call once; cached thereafter).
- `measure(assets, { plate?, perSide?, scale? }): { width, height }` — canvas pixel size; set `canvas.width/height` before drawing.
- `drawDumbbell(ctx, assets, { plate?, perSide?, scale? })` — draws on a transparent canvas.
- `PLATE_KEYS` — `["blue","green","yellow","black","grey","white"]`.

`scale` is a supersampling factor for crisp output on HiDPI screens (2 is a good default; use the canvas via CSS `width:100%`).

### Optional weight mapping

The kit is colour-only; map colours to weights however you like, e.g.:

```ts
const WEIGHT_LB = { blue: 45, yellow: 35, black: 25, grey: 15, green: 10, white: 5 };
```
