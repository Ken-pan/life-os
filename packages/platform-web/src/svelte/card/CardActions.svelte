<script>
  import { getContext, onMount } from 'svelte'
  import './card.css'
  import { CARD_CONTEXT_KEY } from './card-context.js'

  /** @type {{ class?: string, children?: import('svelte').Snippet, [key: string]: unknown }} */
  let { class: className = '', children, ...rest } = $props()

  const cardContext = /** @type {import('./card-context.js').CardContext | undefined} */ (
    getContext(CARD_CONTEXT_KEY)
  )

  onMount(() => {
    if (import.meta.env?.DEV && cardContext?.interactive) {
      console.warn(
        '[@life-os/platform-web/svelte/card] CardActions must not be used inside an interactive Card. ' +
          'Use a non-interactive Card for action rows, or an interactive Card without nested buttons/links.',
      )
    }
  })
</script>

<div class={['life-card__actions', className]} {...rest}>
  {@render children?.()}
</div>
