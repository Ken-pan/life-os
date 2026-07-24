<script>
  import { fade } from 'svelte/transition'
  import { preloadLeoAvatars } from '$lib/kenos/leoAvatar.core.js'

  /**
   * Leo 聊天气泡头像:表情切换时新旧图 crossfade,避免 src 硬切换的闪烁感。
   * `{#key src}` 让 Svelte 在 src 变化时并存 out(旧图)+ in(新图)两个
   * 绝对定位图层,叠加过渡即为 crossfade;无需手写 rAF/定时器状态机。
   * @type {{
   *   src: string,
   *   expression?: import('$lib/kenos/leoAvatar.core.js').LeoExpression,
   *   alt: string,
   *   size?: number,
   *   live?: boolean,
   * }}
   */
  let {
    src,
    expression = 'neutral',
    alt,
    size = 36,
    live = false,
  } = $props()

  // 首次挂载即预热全部表情素材,后续切换表情命中缓存,不再等网络加载。
  preloadLeoAvatars()

  const prefersReducedMotion =
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  const CROSSFADE_MS = prefersReducedMotion ? 0 : 220
</script>

<span
  class="leo-avatar"
  class:leo-avatar-serious={expression === 'serious'}
  class:leo-avatar-smile={expression === 'smile'}
  class:leo-avatar-soft={expression === 'soft'}
  class:leo-avatar-live={live && !prefersReducedMotion}
  style={`--leo-avatar-size:${size}px`}
  data-live={live ? 'true' : undefined}
>
  {#key src}
    <img
      class="leo-avatar-layer"
      {src}
      {alt}
      width={size}
      height={size}
      decoding="async"
      in:fade={{ duration: CROSSFADE_MS }}
      out:fade={{ duration: CROSSFADE_MS }}
    />
  {/key}
</span>

<style>
  .leo-avatar {
    position: relative;
    flex: 0 0 auto;
    display: block;
    width: var(--leo-avatar-size, 36px);
    height: var(--leo-avatar-size, 36px);
    margin-top: 2px;
    border-radius: 50%;
    overflow: hidden;
    border: 0;
    background: var(--bg-2);
    box-shadow: 0 0 0 1px color-mix(in oklab, #fff 10%, transparent);
    transition:
      box-shadow 220ms ease,
      transform 220ms ease;
  }

  .leo-avatar-serious {
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--t1) 28%, transparent);
  }

  .leo-avatar-smile {
    box-shadow: 0 0 0 1px color-mix(in oklab, #c45c26 32%, transparent);
  }

  .leo-avatar-soft {
    box-shadow:
      0 0 0 1px color-mix(in oklab, #c45c26 40%, transparent),
      0 0 12px color-mix(in oklab, #c45c26 18%, transparent);
  }

  /* 说话 / 流式时:暖色呼吸光 + 极轻缩放,像他在你旁边 */
  .leo-avatar-live {
    box-shadow:
      0 0 0 2px color-mix(in oklab, #c45c26 30%, transparent),
      0 0 18px color-mix(in oklab, #c45c26 32%, transparent);
    animation: leo-avatar-breathe 2.6s ease-in-out infinite;
  }

  .leo-avatar-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 18%;
  }

  @keyframes leo-avatar-breathe {
    0%,
    100% {
      transform: scale(1);
      box-shadow:
        0 0 0 2px color-mix(in oklab, #c45c26 22%, transparent),
        0 0 12px color-mix(in oklab, #c45c26 22%, transparent);
    }
    50% {
      transform: scale(1.04);
      box-shadow:
        0 0 0 3px color-mix(in oklab, #c45c26 40%, transparent),
        0 0 26px color-mix(in oklab, #c45c26 46%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .leo-avatar-live {
      animation: none;
    }
  }
</style>
