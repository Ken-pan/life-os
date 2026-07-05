<script>
  import { onMount } from 'svelte';
  import { getAnalyser } from '$lib/audioAnalyser.js';
  import { player } from '$lib/player.svelte.js';

  let canvas = $state(null);
  /** @type {number | undefined} */
  let rafId;

  function accentColor() {
    const root = getComputedStyle(document.documentElement);
    return root.getPropertyValue('--track-accent').trim() || root.getPropertyValue('--accent').trim() || '#c41e3a';
  }

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

    const barCount = 32;
    const data = new Uint8Array(barCount);

    function draw() {
      const analyser = getAnalyser();
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;

      ctx.clearRect(0, 0, w, h);
      const fill = accentColor();
      const gap = 3;
      const barW = Math.max(2, (w - gap * (barCount - 1)) / barCount);

      if (analyser && player.playing) {
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < barCount; i++) {
          const norm = data[i] / 255;
          const barH = Math.max(4, norm * h * 0.92);
          const x = i * (barW + gap);
          const y = (h - barH) / 2;
          ctx.fillStyle = fill;
          ctx.globalAlpha = 0.28 + norm * 0.72;
          roundBar(ctx, x, y, barW, barH, barW / 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      } else {
        const idleH = 4;
        ctx.fillStyle = fill;
        ctx.globalAlpha = 0.22;
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
</script>

<canvas class="audio-visualizer" bind:this={canvas} aria-hidden="true"></canvas>

<style>
  .audio-visualizer {
    width: min(100%, 480px);
    height: 48px;
    display: block;
    margin: 0 auto;
  }
</style>
