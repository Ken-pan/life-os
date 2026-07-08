<script>
  import { tick } from 'svelte';
  import Icon from '../icon/Icon.svelte';
  import { activateFocusTrap } from '@life-os/theme';

  /** @type {{
   *   open: boolean;
   *   title: string;
   *   groups: import('../../navigation.d.ts').WebNavGroup[];
   *   pathname: string;
   *   search?: string;
   *   closeLabel: string;
   *   onClose: () => void;
   *   manageFocus?: boolean;
   * }} */
  let {
    open,
    title,
    groups,
    pathname,
    search = '',
    closeLabel,
    onClose,
    manageFocus = true,
  } = $props();

  /** @type {HTMLDivElement | null} */
  let sheetEl = $state(null);

  /** @param {import('../../navigation.d.ts').WebNavItem} item */
  function isActive(item) {
    return item.match(pathname, search);
  }

  $effect(() => {
    if (!open) return;
    /** @type {(() => void) | null} */
    let releaseFocus = null;
    let cancelled = false;

    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    tick().then(() => {
      if (cancelled || !sheetEl || !manageFocus) return;
      releaseFocus = activateFocusTrap(sheetEl);
    });

    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      releaseFocus?.();
    };
  });
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="mobile-more-backdrop" onclick={onClose} aria-hidden="true"></div>
  <div
    bind:this={sheetEl}
    class="mobile-more-sheet"
    role="dialog"
    aria-modal="true"
    aria-labelledby="mobile-more-title"
  >
    <div class="mobile-more-handle" aria-hidden="true"></div>
    <div class="mobile-more-header">
      <h2 id="mobile-more-title" class="mobile-more-title">{title}</h2>
      <button type="button" class="mobile-more-close" onclick={onClose} aria-label={closeLabel}>
        <Icon name="x" size={20} strokeWidth={1.75} />
      </button>
    </div>
    <div class="mobile-more-body">
      {#each groups as group (group.label)}
        <div class="mobile-more-section">
          <p class="mobile-more-section-label">{group.label}</p>
          {#each group.items as item (item.href)}
            <a
              class="mobile-more-row"
              class:active={isActive(item)}
              href={item.href}
              data-sveltekit-noscroll
              aria-current={isActive(item) ? 'page' : undefined}
              onclick={onClose}
            >
              <span class="mobile-more-row-icon" aria-hidden="true">
                {#if item.dotColor}
                  <span class="sidebar-dot" style:background={item.dotColor}></span>
                {:else}
                  <Icon name={item.icon} size={20} strokeWidth={1.75} />
                {/if}
              </span>
              <span class="mobile-more-row-label">{item.label}</span>
              {#if isActive(item)}
                <span class="mobile-more-row-check" aria-hidden="true">✓</span>
              {:else}
                <Icon name="chevron-right" size={18} strokeWidth={1.75} class="mobile-more-row-chevron" />
              {/if}
            </a>
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}
