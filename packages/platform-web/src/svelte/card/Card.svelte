<script>
  import { setContext } from 'svelte'
  import './card.css'
  import { CARD_CONTEXT_KEY } from './card-context.js'

  /**
   * Card root primitive.
   *
   * When `interactive={true}`, renders as `<button type="button">` and ignores `as`.
   * Do not place CardActions, buttons, links, or form controls inside an interactive Card.
   *
   * When `interactive={false}`, `disabled` is visual-only (not native disabled).
   *
   * @type {{
   *   variant?: 'surface' | 'elevated' | 'subtle' | 'ghost',
   *   density?: 'compact' | 'comfortable',
   *   interactive?: boolean,
   *   selected?: boolean,
   *   disabled?: boolean,
   *   as?: 'article' | 'section' | 'div',
   *   class?: string,
   *   children?: import('svelte').Snippet,
   *   [key: string]: unknown
   * }} */
  let {
    variant = 'surface',
    density = 'comfortable',
    interactive = false,
    selected = false,
    disabled = false,
    as = 'article',
    class: className = '',
    children,
    ...rest
  } = $props()

  const tag = $derived(interactive ? 'button' : as)

  setContext(CARD_CONTEXT_KEY, {
    get interactive() {
      return interactive
    },
  })
</script>

<svelte:element
  this={tag}
  class={[
    'life-card',
    `life-card--${variant}`,
    `life-card--${density}`,
    className,
  ]}
  class:life-card--interactive={interactive}
  class:life-card--selected={selected}
  class:life-card--disabled={disabled}
  type={tag === 'button' ? 'button' : undefined}
  disabled={tag === 'button' ? disabled : undefined}
  aria-disabled={tag !== 'button' && disabled ? 'true' : undefined}
  aria-pressed={interactive && selected && !disabled ? 'true' : undefined}
  {...rest}
>
  {@render children?.()}
</svelte:element>
