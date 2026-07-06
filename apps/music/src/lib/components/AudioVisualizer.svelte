<script>
  import { onMount } from 'svelte';
  import { getAnalyser, attachAnalyserWhenReady } from '$lib/audioAnalyser.js';
  import { player, getProgressPct } from '$lib/player.svelte.js';

  let { quiet = false } = $props();

  let canvas = $state(null);
  /** @type {number | undefined} */
  let rafId;

  const showVisualizer = $derived(!quiet || player.playing);

  /** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
  function roundBar(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }

  onMount(() => {
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    const barCount = quiet ? 36 : 32;
    const data = new Uint8Array(barCount);
    let smoothed = new Float32Array(barCount);

    function draw() {
      if (player.playing) void attachAnalyserWhenReady();
      const analyser = getAnalyser();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      ctx.clearRect(0, 0, w, h);
      const gap = quiet ? 5 : 3;
      const barW = quiet ? 4 : Math.max(2, (w - gap * (barCount - 1)) / barCount);
      const playedPct = quiet ? getProgressPct() / 100 : 0;
      const idleFill = quiet ? 'rgba(218, 184, 198, 0.24)' : getAccentColor();
      const playedFill = quiet ? 'rgba(226, 120, 146, 0.48)' : getAccentColor();
      const maxAlpha = quiet ? 0.32 : 0.72;
      const minAlpha = quiet ? 0.14 : 0.22;
      const minBarH = quiet ? 8 : 4;
      const maxBarScale = quiet ? 0.68 : 0.92;

      if (analyser && player.playing) {
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < barCount; i++) {
          const norm = data[i] / 255;
          smoothed[i] = smoothed[i] * 0.72 + norm * 0.28;
          const barH = Math.max(minBarH * 0.35, smoothed[i] * h * maxBarScale);
          const x = i * (barW + gap);
          const y = (h - barH) / 2;
          const played = quiet && i / barCount <= playedPct;
          ctx.fillStyle = played ? playedFill : idleFill;
          ctx.globalAlpha = minAlpha + smoothed[i] * (maxAlpha - minAlpha);
          roundBar(ctx, x, y, barW, barH, barW / 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        const idleH = quiet ? minBarH * 0.35 : 4;
        for (let i = 0; i < barCount; i++) {
          const x = i * (barW + gap);
          const played = quiet && i / barCount <= playedPct;
          ctx.fillStyle = played ? playedFill : idleFill;
          ctx.globalAlpha = quiet ? (played ? 0.42 : 0.18) : minAlpha;
          roundBar(ctx, x, (h - idleH) / 2, barW, idleH, barW / 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      rafId = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  });

  function getAccentColor() {
    const root = getComputedStyle(document.documentElement);
    return root.getPropertyValue('--track-accent').trim() || root.getPropertyValue('--accent').trim() || '#c41e3a';
  }
</script>

<canvas
  class="audio-visualizer"
  class:audio-visualizer--quiet={quiet}
  class:audio-visualizer--hidden={quiet && !showVisualizer}
  bind:this={canvas}
  aria-hidden="true"
></canvas>

<style>
  .audio-visualizer {
    width: min(100%, 480px);
    height: 48px;
    display: block;
    margin: 0 auto;
  }

  .audio-visualizer--quiet {
    width: min(100%, 520px);
    height: 32px;
    opacity: 0.88;
  }

  .audio-visualizer--hidden {
    height: 0;
    opacity: 0;
    overflow: hidden;
    margin: 0;
  }
</style>
