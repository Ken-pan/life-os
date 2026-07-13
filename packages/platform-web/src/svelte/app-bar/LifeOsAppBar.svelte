<script>
  import Icon from '../icon/Icon.svelte'

  /**
   * @type {{
   *   leading?: import('svelte').Snippet,
   *   titles?: import('svelte').Snippet,
   *   trailing?: import('svelte').Snippet,
   *   title?: string,
   *   subtitle?: string,
   *   backHref?: string,
   *   backLabel?: string,
   *   onBack?: () => void,
   *   hidden?: boolean,
   *   barClass?: string
   * }}
   */
  let {
    leading,
    titles,
    trailing,
    title,
    subtitle,
    backHref,
    backLabel = 'Back',
    onBack,
    hidden = false,
    barClass = '',
  } = $props()

  const hasBack = $derived(Boolean(backHref) || Boolean(onBack))
</script>

{#if !hidden}
  <header class={`appbar ${barClass}`.trim()} class:appbar--back={hasBack}>
    <div class="appbar-inner">
      <div class="appbar-leading">
        {#if onBack}
          <button type="button" class="appbar-back" onclick={onBack}>
            <Icon name="chevron-left" size={16} strokeWidth={2.5} />
            <span class="appbar-back-label">{backLabel}</span>
          </button>
        {:else if backHref}
          <a class="appbar-back" href={backHref}>
            <Icon name="chevron-left" size={16} strokeWidth={2.5} />
            <span class="appbar-back-label">{backLabel}</span>
          </a>
        {:else}
          {@render leading?.()}
        {/if}
      </div>

      {#if titles}
        {@render titles()}
      {:else if title}
        <div class="appbar-titles">
          <h1 class="page-title">{title}</h1>
          {#if subtitle}<p class="page-sub">{subtitle}</p>{/if}
        </div>
      {/if}

      <div class="appbar-trailing">
        {@render trailing?.()}
      </div>
    </div>
  </header>
{/if}
