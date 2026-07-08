<script>
  import './card.css'

  /** @type {{ class?: string, children?: import('svelte').Snippet, [key: string]: unknown }} */
  let { class: className = '', children, ...rest } = $props()
</script>

<h3 class={['life-card__title', className]} {...rest}>
  {@render children?.()}
</h3>
