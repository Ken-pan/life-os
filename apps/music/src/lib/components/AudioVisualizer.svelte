<script>
  import { onMount } from 'svelte';
  import { getAnalyser, attachAnalyserWhenReady } from '$lib/audioAnalyser.js';
  import { player } from '$lib/player.svelte.js';

  let { quiet = false } = $props();

  let canvas = $state(null);
  /** @type {number | undefined} */
  let rafId;

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

    const barCount = quiet ? 24 : 32;
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
      const gap = quiet ? 4 : 3;
      const barW = Math.max(quiet ? 3 : 2, (w - gap * (barCount - 1)) / barCount);
      const fill = quiet ? 'rgba(180, 160, 200, 0.88)' : getAccentColor();
      const maxAlpha = quiet ? 0.34 : 0.72;
      const minAlpha = quiet ? 0.12 : 0.22;

      if (analyser && player.playing) {
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < barCount; i++) {
          const norm = data[i] / 255;
          smoothed[i] = smoothed[i] * 0.72 + norm * 0.28;
          const barH = Math.max(quiet ? 3 : 4, smoothed[i] * h * (quiet ? 0.72 : 0.92));
          const x = i * (barW + gap);
          const y = (h - barH) / 2;
          ctx.fillStyle = fill;
          ctx.globalAlpha = minAlpha + smoothed[i] * (maxAlpha - minAlpha);
          roundBar(ctx, x, y, barW, barH, barW / 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        const idleH = quiet ? 3 : 4;
        ctx.fillStyle = fill;
        ctx.globalAlpha = quiet ? 0.14 : minAlpha;
        for (let i = 0; i < barCount; i++) {
          const x = i * (barW + gap);
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

<canvas class="audio-visualizer" class:audio-visualizer--quiet={quiet} bind:this={canvas} aria-hidden="true"></canvas>

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
</style>
