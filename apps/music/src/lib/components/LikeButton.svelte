<script>
  import Icon from './Icon.svelte'
  import { toggleLike } from '$lib/db.js'
  import { t } from '$lib/i18n/index.js'

  /** @type {{ trackId: string, liked?: 0 | 1, variant?: 'row' | 'table' | 'np-mobile' | 'np-desktop' | 'mini', size?: number, class?: string, onChange?: (next: 0 | 1) => void }} */
  let {
    trackId,
    liked = 0,
    variant = 'row',
    size = 18,
    class: className = '',
    onChange,
  } = $props()

  const isLiked = $derived(liked === 1)
  let busy = $state(false)

  /** @param {MouseEvent} e */
  async function handleClick(e) {
    e.stopPropagation()
    if (busy || !trackId) return
    busy = true
    try {
      const next = await toggleLike(trackId)
      if (next === 0 || next === 1) onChange?.(next)
    } finally {
      busy = false
    }
  }
</script>

<button
  type="button"
  class="like-btn like-btn--{variant} {className}"
  class:is-liked={isLiked}
  aria-label={t('liked.ariaLabel')}
  aria-pressed={isLiked}
  aria-busy={busy}
  disabled={busy}
  onclick={handleClick}
>
  <Icon
    name="heart"
    {size}
    strokeWidth={isLiked ? 2.25 : 1.75}
    fill={isLiked ? 'currentColor' : 'none'}
  />
</button>
