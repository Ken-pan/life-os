<script>
  /**
   * Leo 桌宠共享立绘 — 应用内浮层(LeoPetOverlay)与 /pet 置顶小窗共用。
   * 分层:bubble(台词气泡)/ adorners(思考点·Zzz·涟漪·爱心)/ motion(姿势级动效)/ img(静帧)。
   * 动效全部 CSS keyframes,transform 只作用于内层,不与外层拖拽/悬浮变换打架;
   * prefers-reduced-motion 下动效与粒子整体关停。
   * @type {{
   *   pose?: import('$lib/kenos/leoPet.core.js').LeoPetPose,
   *   idleFrame?: 0 | 1,
   *   sizePx?: number,
   *   alt?: string,
   *   quip?: string | null,
   *   bubbleAlign?: 'right' | 'center',
   *   bubblePlacement?: 'up' | 'down',
   *   heartsBurst?: number,
   *   dropSignal?: number,
   *   onquipclick?: () => void,
   * }}
   */
  let {
    pose = 'idle',
    idleFrame = 0,
    sizePx = 120,
    alt = '',
    quip = null,
    bubbleAlign = 'right',
    bubblePlacement = 'up',
    heartsBurst = 0,
    dropSignal = 0,
    onquipclick,
  } = $props()

  import { leoPetSrc } from '$lib/kenos/leoPet.core.js'

  const src = $derived(leoPetSrc(pose, { idleFrame: idleFrame === 1 ? 1 : 0 }))
</script>

<span class="sprite" data-pose={pose} style={`--pet-size:${sizePx}px`}>
  {#if quip}
    <button
      type="button"
      class="bubble"
      class:center={bubbleAlign === 'center'}
      class:down={bubblePlacement === 'down'}
      data-testid="leo-pet-quip"
      aria-live="polite"
      onclick={() => onquipclick?.()}
    >
      {quip}
    </button>
  {/if}

  {#if pose === 'think' || pose === 'busy'}
    <span class="dots" class:fast={pose === 'busy'} aria-hidden="true">
      <i></i><i></i><i></i>
    </span>
  {/if}
  {#if pose === 'sleep'}
    <span class="zzz" aria-hidden="true"><i>Z</i><i>z</i><i>z</i></span>
  {/if}
  {#if pose === 'listen'}
    <span class="ripple" aria-hidden="true"></span>
  {/if}
  {#if pose === 'soft'}
    <span class="soft-heart" aria-hidden="true">♥</span>
  {/if}
  {#if heartsBurst > 0}
    {#key heartsBurst}
      <span class="hearts" aria-hidden="true"><i>♥</i><i>♥</i><i>♥</i></span>
    {/key}
  {/if}

  {#key dropSignal}
    <span class="motion" class:landed={dropSignal > 0} data-pose={pose}>
      {#key pose}
        <img
          class="img"
          {src}
          {alt}
          width={sizePx}
          height={sizePx}
          draggable="false"
          decoding="async"
        />
      {/key}
    </span>
  {/key}
</span>

<style>
  .sprite {
    position: relative;
    display: block;
    width: var(--pet-size, 120px);
    height: var(--pet-size, 120px);
  }

  /* —— 台词气泡 —— */
  .bubble {
    position: absolute;
    bottom: calc(100% + 10px);
    right: -4px;
    z-index: 3;
    max-width: var(--pet-bubble-max, 230px);
    width: max-content;
    margin: 0;
    padding: 8px 11px;
    border: 1px solid color-mix(in oklab, var(--t1, #f5f5f7) 14%, transparent);
    border-radius: 14px;
    border-bottom-right-radius: 4px;
    background: color-mix(in oklab, var(--bg, #1c1c1e) 92%, transparent);
    color: var(--t1, #f5f5f7);
    font: inherit;
    font-size: 12.5px;
    line-height: 1.45;
    text-align: left;
    cursor: pointer;
    pointer-events: auto;
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 22px color-mix(in oklab, var(--t1, #000) 14%, transparent);
    animation: bubble-in 180ms ease;
  }
  .bubble.center {
    right: auto;
    left: 50%;
    transform: translateX(-50%);
    border-bottom-right-radius: 14px;
    border-bottom-left-radius: 14px;
    animation-name: bubble-in-center;
  }
  /* 向下变体:桌宠贴视口顶部时气泡改往下弹,不越界被裁 */
  .bubble.down {
    bottom: auto;
    top: calc(100% + 10px);
    border-radius: 14px;
    border-bottom-right-radius: 14px;
    border-top-right-radius: 4px;
    animation-name: bubble-in-down;
  }
  .bubble.center.down {
    border-top-right-radius: 14px;
    border-top-left-radius: 4px;
  }
  .bubble::after {
    content: '';
    position: absolute;
    bottom: -5px;
    right: 18px;
    width: 9px;
    height: 9px;
    background: inherit;
    border-right: 1px solid
      color-mix(in oklab, var(--t1, #f5f5f7) 14%, transparent);
    border-bottom: 1px solid
      color-mix(in oklab, var(--t1, #f5f5f7) 14%, transparent);
    transform: rotate(45deg);
  }
  .bubble.center::after {
    right: calc(50% - 5px);
  }
  /* 向下变体:箭头翻到气泡顶部、指向上方的桌宠 */
  .bubble.down::after {
    bottom: auto;
    top: -5px;
    border-right: none;
    border-bottom: none;
    border-left: 1px solid color-mix(in oklab, var(--t1, #f5f5f7) 14%, transparent);
    border-top: 1px solid color-mix(in oklab, var(--t1, #f5f5f7) 14%, transparent);
  }

  /* —— 姿势动效层 —— */
  .motion {
    position: absolute;
    inset: 0;
    display: block;
    transform-origin: 50% 100%;
  }
  .motion.landed {
    animation: pet-land 340ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    object-position: center bottom;
    display: block;
    border-radius: 50%;
    background: transparent;
    user-select: none;
    -webkit-user-drag: none;
    transform-origin: 50% 100%;
    filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.22));
    animation: pet-in 220ms ease;
  }
  .motion[data-pose='idle'] .img {
    animation:
      pet-in 220ms ease,
      pet-breathe 3.4s ease-in-out 220ms infinite;
  }
  .motion[data-pose='wave'] .img {
    animation:
      pet-in 220ms ease,
      pet-rock 1.1s ease-in-out 220ms infinite;
  }
  .motion[data-pose='happy'] .img {
    animation:
      pet-in 220ms ease,
      pet-bounce 0.72s cubic-bezier(0.36, 0, 0.64, 1) 220ms infinite;
  }
  .motion[data-pose='think'] .img {
    animation:
      pet-in 220ms ease,
      pet-sway 2.8s ease-in-out 220ms infinite;
  }
  .motion[data-pose='busy'] .img {
    animation:
      pet-in 220ms ease,
      pet-sway 1.6s ease-in-out 220ms infinite;
  }
  .motion[data-pose='listen'] .img {
    animation:
      pet-in 220ms ease,
      pet-pulse 1.6s ease-in-out 220ms infinite;
  }
  .motion[data-pose='sleep'] {
    filter: brightness(0.92) saturate(0.9);
    opacity: 0.9;
  }
  .motion[data-pose='sleep'] .img {
    animation:
      pet-in 220ms ease,
      pet-doze 4.2s ease-in-out 220ms infinite;
  }
  .motion[data-pose='soft'] .img {
    filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.22))
      drop-shadow(0 0 14px color-mix(in oklab, #c45c26 34%, transparent));
    animation:
      pet-in 220ms ease,
      pet-breathe 2.6s ease-in-out 220ms infinite;
  }
  .motion[data-pose='petted'] .img {
    filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.22))
      drop-shadow(0 0 12px color-mix(in oklab, #e0645c 26%, transparent));
    animation:
      pet-in 220ms ease,
      pet-rock 1.4s ease-in-out 220ms infinite;
  }
  .motion[data-pose='celebrate'] .img {
    animation:
      pet-in 220ms ease,
      pet-bounce 0.6s cubic-bezier(0.36, 0, 0.64, 1) 220ms infinite;
  }
  .motion[data-pose='stretch'] .img {
    animation:
      pet-in 220ms ease,
      pet-rise 3.6s ease-in-out 220ms;
  }
  /* 语境帧(咖啡/坏笑/摇杯/做饭/道歉):安静呼吸即可 */
  .motion[data-pose='coffee'] .img,
  .motion[data-pose='smirk'] .img,
  .motion[data-pose='shake'] .img,
  .motion[data-pose='cook'] .img,
  .motion[data-pose='oops'] .img {
    animation:
      pet-in 220ms ease,
      pet-breathe 3s ease-in-out 220ms infinite;
  }
  /* 朗读:说话节奏轻脉动;画画:轻晃;哈欠:慢浮沉 */
  .motion[data-pose='speak'] .img {
    animation:
      pet-in 220ms ease,
      pet-pulse 1.2s ease-in-out 220ms infinite;
  }
  .motion[data-pose='draw'] .img {
    animation:
      pet-in 220ms ease,
      pet-sway 2.2s ease-in-out 220ms infinite;
  }
  .motion[data-pose='yawn'] .img {
    animation:
      pet-in 220ms ease,
      pet-doze 4.2s ease-in-out 220ms infinite;
  }

  /* —— 思考点(打字指示器节奏)—— */
  .dots {
    position: absolute;
    top: -4px;
    right: 10%;
    z-index: 2;
    display: flex;
    gap: 3px;
  }
  .dots i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: color-mix(in oklab, var(--t1, #f5f5f7) 72%, transparent);
    animation: dot-beat 1.3s ease-in-out infinite;
  }
  .dots.fast i {
    animation-duration: 0.8s;
  }
  .dots i:nth-child(2) {
    animation-delay: 0.18s;
  }
  .dots i:nth-child(3) {
    animation-delay: 0.36s;
  }

  /* —— 睡眠 Zzz —— */
  .zzz {
    position: absolute;
    top: -8px;
    right: 4%;
    z-index: 2;
    font-size: calc(var(--pet-size, 120px) * 0.14);
    font-weight: 700;
    color: color-mix(in oklab, var(--t1, #f5f5f7) 62%, transparent);
    pointer-events: none;
  }
  .zzz i {
    display: inline-block;
    font-style: normal;
    animation: zzz-float 3.2s ease-in-out infinite;
  }
  .zzz i:nth-child(2) {
    font-size: 0.78em;
    animation-delay: 0.5s;
  }
  .zzz i:nth-child(3) {
    font-size: 0.6em;
    animation-delay: 1s;
  }

  /* —— 聆听涟漪 —— */
  .ripple {
    position: absolute;
    inset: 6%;
    z-index: 0;
    border-radius: 50%;
    border: 2px solid color-mix(in oklab, var(--accent, #c48) 46%, transparent);
    animation: ripple-out 1.6s ease-out infinite;
    pointer-events: none;
  }

  /* —— soft 常驻单心 —— */
  .soft-heart {
    position: absolute;
    top: -6px;
    left: 12%;
    z-index: 2;
    font-size: calc(var(--pet-size, 120px) * 0.13);
    color: color-mix(in oklab, #e0645c 82%, transparent);
    animation: heart-drift 2.8s ease-in-out infinite;
    pointer-events: none;
  }

  /* —— 抚摸爱心迸发(一次性)—— */
  .hearts {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }
  .hearts i {
    position: absolute;
    bottom: 42%;
    font-style: normal;
    font-size: calc(var(--pet-size, 120px) * 0.12);
    color: color-mix(in oklab, #e0645c 85%, transparent);
    opacity: 0;
    animation: heart-pop 1.15s ease-out forwards;
  }
  .hearts i:nth-child(1) {
    left: 22%;
  }
  .hearts i:nth-child(2) {
    left: 46%;
    animation-delay: 0.14s;
  }
  .hearts i:nth-child(3) {
    left: 68%;
    animation-delay: 0.28s;
  }

  /* 入场只动 transform:内容可见性绝不依赖动画播完
     (后台标签/省电模式会冻结 CSS 动画,opacity 起步的入场会把内容卡在隐形) */
  @keyframes pet-in {
    from {
      transform: scale(0.96);
    }
    to {
      transform: scale(1);
    }
  }
  @keyframes pet-breathe {
    0%,
    100% {
      transform: translateY(0) scale(1);
    }
    50% {
      transform: translateY(-1.5px) scale(1.012);
    }
  }
  @keyframes pet-rock {
    0%,
    100% {
      transform: rotate(-3.5deg);
    }
    50% {
      transform: rotate(3.5deg);
    }
  }
  @keyframes pet-bounce {
    0%,
    100% {
      transform: translateY(0) scaleY(1);
    }
    30% {
      transform: translateY(-7%) scaleY(1.02);
    }
    60% {
      transform: translateY(0) scaleY(0.97);
    }
  }
  @keyframes pet-sway {
    0%,
    100% {
      transform: rotate(-1.6deg);
    }
    50% {
      transform: rotate(1.6deg);
    }
  }
  @keyframes pet-pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.035);
    }
  }
  @keyframes pet-rise {
    0% {
      transform: translateY(0) scale(1);
    }
    35% {
      transform: translateY(-3px) scale(1.02);
    }
    70% {
      transform: translateY(-3px) scale(1.02);
    }
    100% {
      transform: translateY(0) scale(1);
    }
  }
  @keyframes pet-doze {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(2px);
    }
  }
  @keyframes pet-land {
    0% {
      transform: scaleX(1.06) scaleY(0.92);
    }
    55% {
      transform: scaleX(0.98) scaleY(1.03);
    }
    100% {
      transform: scaleX(1) scaleY(1);
    }
  }
  @keyframes bubble-in {
    from {
      transform: translateY(4px);
    }
    to {
      transform: translateY(0);
    }
  }
  @keyframes bubble-in-center {
    from {
      transform: translate(-50%, 4px);
    }
    to {
      transform: translate(-50%, 0);
    }
  }
  /* 向下弹出时入场从上方微移 */
  @keyframes bubble-in-down {
    from {
      transform: translateY(-4px);
    }
    to {
      transform: translateY(0);
    }
  }
  @keyframes dot-beat {
    0%,
    60%,
    100% {
      opacity: 0.35;
      transform: translateY(0);
    }
    30% {
      opacity: 1;
      transform: translateY(-3px);
    }
  }
  @keyframes zzz-float {
    0% {
      opacity: 0;
      transform: translate(0, 2px);
    }
    30% {
      opacity: 0.9;
    }
    100% {
      opacity: 0;
      transform: translate(6px, -10px);
    }
  }
  @keyframes ripple-out {
    0% {
      opacity: 0.55;
      transform: scale(0.92);
    }
    100% {
      opacity: 0;
      transform: scale(1.22);
    }
  }
  @keyframes heart-drift {
    0%,
    100% {
      opacity: 0.55;
      transform: translateY(0) scale(1);
    }
    50% {
      opacity: 0.95;
      transform: translateY(-5px) scale(1.08);
    }
  }
  @keyframes heart-pop {
    0% {
      opacity: 0;
      transform: translateY(0) scale(0.7);
    }
    25% {
      opacity: 0.95;
    }
    100% {
      opacity: 0;
      transform: translateY(calc(var(--pet-size, 120px) * -0.42)) scale(1.05);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .img,
    .motion[data-pose='idle'] .img,
    .motion[data-pose='wave'] .img,
    .motion[data-pose='happy'] .img,
    .motion[data-pose='think'] .img,
    .motion[data-pose='busy'] .img,
    .motion[data-pose='listen'] .img,
    .motion[data-pose='sleep'] .img,
    .motion[data-pose='soft'] .img,
    .motion[data-pose='petted'] .img,
    .motion[data-pose='celebrate'] .img,
    .motion[data-pose='stretch'] .img,
    .motion[data-pose='coffee'] .img,
    .motion[data-pose='smirk'] .img,
    .motion[data-pose='shake'] .img,
    .motion[data-pose='cook'] .img,
    .motion[data-pose='oops'] .img,
    .motion[data-pose='speak'] .img,
    .motion[data-pose='draw'] .img,
    .motion[data-pose='yawn'] .img,
    .motion.landed,
    .bubble,
    .zzz i,
    .soft-heart,
    .dots i {
      animation: none;
    }
    .ripple,
    .hearts {
      display: none;
    }
    .dots i {
      opacity: 0.7;
    }
  }

  /* 气泡的 .center 变体带 translateX,禁动效时也要保住定位 */
  @media (prefers-reduced-motion: reduce) {
    .bubble.center {
      transform: translateX(-50%);
    }
  }
</style>
