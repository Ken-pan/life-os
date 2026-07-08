<script>
  import './card.css'

  /** @type {{ class?: string, children?: import('svelte').Snippet, [key: string]: unknown }} */
  let { class: className = '', children, ...rest } = $props()
</script>

<p class={['life-card__description', className]} {...rest}>
  {@render children?.()}
</p>
