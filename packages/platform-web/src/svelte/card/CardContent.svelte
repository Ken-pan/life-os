<script>
  import './card.css'

  /** @type {{ class?: string, children?: import('svelte').Snippet, [key: string]: unknown }} */
  let { class: className = '', children, ...rest } = $props()
</script>

<div class={['life-card__content', className]} {...rest}>
  {@render children?.()}
</div>
