<script>
  import { onMount } from 'svelte';
  import { replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { LIBRARY } from '$lib/data/library.js';
  import {
    getLibraryFilterChips,
    entryMatchesCategory,
    resolveCategoryId
  } from '$lib/data/libraryHelpers.js';
  import { localizeLibraryEntry } from '$lib/i18n/libraryLabels.js';
  import libraryEn from '$lib/i18n/messages/library-en.js';
  import { reveal } from '$lib/actions/reveal.js';
  import Icon from '$lib/components/Icon.svelte';
  import BackButton from '$lib/components/BackButton.svelte';
  import { t } from '$lib/i18n/index.js';

  const filterChips = $derived(
    getLibraryFilterChips().map((cat) => ({
      ...cat,
      label: t(`library.categories.${cat.id}`)
    }))
  );

  let queryInput = $state('');
  let query = $state('');
  let showTopFab = $state(false);
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let debounceTimer;

  function onSearchInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      query = queryInput;
    }, 200);
  }

  const activeCategory = $derived(resolveCategoryId(page.url.searchParams.get('tag') ?? ''));

  const activeCategoryLabel = $derived(
    activeCategory ? t(`library.categories.${activeCategory}`) : ''
  );

  /** @param {import('$lib/data/library.js').LibraryEntry} c */
  function searchText(c) {
    const en = libraryEn[c.id];
    let parts = [c.title, c.tag, c.cite || ''];
    if (en) parts.push(en.title ?? '', en.tag ?? '', en.cite ?? '');
    if (c.html) parts.push(c.html.replace(/<[^>]+>/g, ' '));
    if (c.table) parts.push(c.table.flat().join(' '));
    if (c.rules) parts.push(c.rules.flat().join(' ').replace(/<[^>]+>/g, ' '));
    return parts.join(' ').toLowerCase();
  }

  /** Wrap li inner HTML so flex bullet layout does not split text nodes / <b> into columns. */
  function renderLibraryHtml(html) {
    return html.replace(/<li(?:\s[^>]*)?>([\s\S]*?)<\/li>/gi, (match, inner) => {
      if (/^\s*<span class="li-body"/i.test(inner)) return match;
      return `<li><span class="li-body">${inner}</span></li>`;
    });
  }

  const cards = $derived(
    LIBRARY.map((c) => {
      const localized = localizeLibraryEntry(c);
      return { ...localized, _search: searchText(c) };
    })
  );
  const filtered = $derived.by(() => {
    let list = cards;
    if (activeCategory) {
      list = list.filter((c) => entryMatchesCategory(c, activeCategory));
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => c._search.includes(q));
    return list;
  });

  const hasFilter = $derived(Boolean(query.trim() || activeCategory));

  function scrollToResults() {
    requestAnimationFrame(() => {
      document.getElementById('lib-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function selectCategory(id) {
    const url = new URL(page.url);
    if (id) {
      url.searchParams.set('tag', id);
    } else {
      url.searchParams.delete('tag');
    }
    const target = `${resolve(url.pathname)}${url.search}${url.hash}`;
    replaceState(target, page.state);
    scrollToResults();
  }

  function clearSearch() {
    queryInput = '';
    query = '';
    clearTimeout(debounceTimer);
  }

  function clearFilters() {
    clearSearch();
    selectCategory('');
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onMount(() => {
    const onScroll = () => {
      showTopFab = window.scrollY > 480;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const hash = window.location.hash.slice(1);
    if (hash.startsWith('lib-')) {
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el?.classList.add('lib-card--highlight');
        setTimeout(() => el?.classList.remove('lib-card--highlight'), 2400);
      });
    }

    return () => window.removeEventListener('scroll', onScroll);
  });
</script>

<section class="view view--library">
  <div class="wrap">
    <div class="page-head" use:reveal>
      <BackButton href="/discover" label={t('tools.backDiscover')} />
    </div>
    <div class="sec-header" use:reveal>
      <h2 class="sec-title">{t('library.title')}</h2>
    </div>

    <div class="lib-filter-bar">
      <div class="library-tools">
        <div class="lib-search-wrap">
          <input
            class="lib-search"
            type="search"
            placeholder={t('library.searchPlaceholder')}
            aria-label={t('library.searchAria')}
            autocomplete="off"
            enterkeyhint="search"
            bind:value={queryInput}
            oninput={onSearchInput}
          />
          {#if queryInput}
            <button
              type="button"
              class="lib-search-clear"
              aria-label={t('library.clearSearch')}
              onclick={clearSearch}
            >
              <Icon name="x" size={16} />
            </button>
          {/if}
        </div>
        {#if hasFilter}
          <div class="lib-count">{t('library.found', { n: filtered.length })}</div>
        {/if}
      </div>

      <div class="lib-chips life-os-scroll-x life-os-scroll-x--snap" role="group" aria-label={t('library.filterAria')}>
        <button
          type="button"
          class="lib-chip"
          class:is-active={!activeCategory}
          aria-pressed={!activeCategory}
          onclick={() => selectCategory('')}
        >
          {t('library.all')}
          <span class="lib-chip-count">{LIBRARY.length}</span>
        </button>
        {#each filterChips as cat (cat.id)}
          <button
            type="button"
            class="lib-chip"
            class:is-active={activeCategory === cat.id}
            aria-pressed={activeCategory === cat.id}
            onclick={() => selectCategory(cat.id)}
          >
            {cat.label}
            <span class="lib-chip-count">{cat.count}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="lib-results" id="lib-results">
      {#if filtered.length === 0}
        <div class="lib-empty">
          <p class="lib-empty-title">{t('library.emptyTitle')}</p>
          <p class="lib-empty-hint">
            {#if query.trim()}
              {t('library.emptySearch')}
            {:else if activeCategory}
              {t('library.emptyCategory', { cat: activeCategoryLabel })}
            {:else}
              {t('library.emptyGeneric')}
            {/if}
          </p>
          {#if hasFilter}
            <button type="button" class="lib-empty-clear" onclick={clearFilters}>
              {t('library.clearFilters')}
            </button>
          {/if}
        </div>
      {/if}

      {#each filtered as c (c.id)}
        <article class="lib-card" id="lib-{c.id}" use:reveal>
          <div class="lc-head">
            {#if c.icon}<Icon name={c.icon} size={18} class="lc-icon" />{/if}
            <div class="lc-tag">{c.tag}</div>
          </div>
          <h3>{c.title}</h3>
          {#if c.html}{@html renderLibraryHtml(c.html)}{/if}
          {#if c.table}
            <div class="lib-table-scroll" role="region" aria-label={t('library.tableScroll')}>
              <table class="vtable">
                <thead>
                  <tr>{#each c.table[0] as h (h)}<th>{h}</th>{/each}</tr>
                </thead>
                <tbody>
                  {#each c.table.slice(1) as r (r[0])}
                    <tr>
                      {#each r as cell, ci (ci)}
                        <td class:mev={ci === 1} class:mav={ci === 2} class:mrv={ci === 3}>{cell}</td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
          {#if c.rules}
            <div class="rules-box">
              {#each c.rules as r, i (r[0])}
                <div class="r-row" class:head={i === 0}>
                  <div class="r-cell">{r[0]}</div>
                  <div class="r-cell act">{@html r[1]}</div>
                </div>
              {/each}
            </div>
          {/if}
          {#if c.cite}<div class="cite">{c.cite}</div>{/if}
        </article>
      {/each}
    </div>
  </div>

  {#if showTopFab}
    <button type="button" class="lib-top-fab" aria-label={t('library.backTop')} onclick={scrollToTop}>
      <Icon name="chevron-left" size={20} class="lib-top-fab-icon" />
    </button>
  {/if}
</section>
