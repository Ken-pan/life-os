<script>
  import Icon from './Icon.svelte';
  import { t } from '$lib/i18n/index.js';

  /** @type {{ title?: string, subtitle?: string, backHref?: string, backLabel?: string, hidden?: boolean, action?: import('$lib/pageChrome.svelte.js').PageChromeAction | null }} */
  let { title, subtitle, backHref, backLabel, hidden = false, action = null } = $props();
  const resolvedBackLabel = $derived(backLabel ?? t('common.back'));
  const hasBack = $derived(Boolean(backHref));
  const hasTools = $derived(Boolean(action));
</script>

{#if !hidden}
  <header class="appbar" class:appbar--back={hasBack} class:appbar--tools={hasTools}>
    <div class="appbar-inner">
      <div class="appbar-leading">
        {#if backHref}
          <a class="appbar-back" href={backHref}>
            <Icon name="chevron-left" size={16} strokeWidth={2.5} />
            <span class="appbar-back-label">{resolvedBackLabel}</span>
          </a>
        {:else}
          <div class="brand appbar-brand" aria-label={t('common.brand')}>
            <img src="/icon.svg" alt="" class="appbar-brand-mark" width="24" height="24" />
            <span class="appbar-brand-name">
              MUSIC<span class="brand-dot">.</span>OS
            </span>
          </div>
        {/if}
      </div>

      {#if title}
        <div class="appbar-titles">
          <h1 class="page-title">{title}</h1>
          {#if subtitle}<p class="page-sub">{subtitle}</p>{/if}
        </div>
      {/if}

      <div class="appbar-trailing">
        {#if action}
          {#if action.href}
            <a
              class={action.variant === 'primary' ? 'btn-primary appbar-action' : 'btn-secondary appbar-action'}
              href={action.href}
            >
              {#if action.icon}<Icon name={action.icon} size={16} />{/if}
              {action.label}
            </a>
          {:else if action.onClick}
            <button
              type="button"
              class={action.variant === 'primary' ? 'btn-primary appbar-action' : 'btn-secondary appbar-action'}
              onclick={action.onClick}
            >
              {#if action.icon}<Icon name={action.icon} size={16} />{/if}
              {action.label}
            </button>
          {/if}
        {/if}
      </div>
    </div>
  </header>
{/if}
