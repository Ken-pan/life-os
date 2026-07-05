<script>
  /**
   * 杠铃渲染（dumbbell-kit sprite 包装，Q 版杠铃视图）
   * · 基于 Canvas 2D 的矢量 sprite 合成，透明背景
   * · plates：每侧片色列表（内→外，大片在内），由凑重结果映射（见 weightMap.js）
   */
  import { loadDumbbell, drawDumbbell, measure } from './dumbbell';

  let { plates = null, plate = 'blue', perSide = 3, scale = 2, class: className = '' } = $props();

  let canvas = $state(null);
  let assets = $state(null);

  $effect(() => {
    let alive = true;
    loadDumbbell().then((a) => {
      if (alive) assets = a;
    });
    return () => {
      alive = false;
    };
  });

  $effect(() => {
    if (!canvas || !assets) return;
    const opts = plates ? { plates, scale } : { plate, perSide, scale };
    const { width, height } = measure(assets, opts);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) drawDumbbell(ctx, assets, opts);
  });
</script>

<canvas bind:this={canvas} class={className}></canvas>
