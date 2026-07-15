<script>
  import { onMount } from 'svelte'
  import { CATALOG_SECTIONS } from '$lib/catalogNav.js'
  import { readCatalogParams, writeCatalogParams } from '$lib/catalogState.js'
  import { CATALOG_STATE_ALL } from '$lib/showcaseStateFilter.js'
  import ThemeMatrix from '$lib/ThemeMatrix.svelte'
  import ResponsiveFrame from '$lib/ResponsiveFrame.svelte'
  import CatalogShell from '$lib/CatalogShell.svelte'
  import CatalogMatrixView from '$lib/CatalogMatrixView.svelte'
  import TokensShowcase from './showcases/TokensShowcase.svelte'
  import ButtonsShowcase from './showcases/ButtonsShowcase.svelte'
  import SegmentsShowcase from './showcases/SegmentsShowcase.svelte'
  import UtilitiesShowcase from './showcases/UtilitiesShowcase.svelte'
  import ModalShowcase from './showcases/ModalShowcase.svelte'
  import SettingsShowcase from './showcases/SettingsShowcase.svelte'
  import ExplainPanelShowcase from './showcases/ExplainPanelShowcase.svelte'
  import BrandShowcase from './showcases/BrandShowcase.svelte'
  import NavigationShowcase from './showcases/NavigationShowcase.svelte'
  import IconShowcase from './showcases/IconShowcase.svelte'
  import FeedbackShowcase from './showcases/FeedbackShowcase.svelte'
  import ToastShowcase from './showcases/ToastShowcase.svelte'
  import CardsShowcase from './showcases/CardsShowcase.svelte'
  import CommandPaletteShowcase from './showcases/CommandPaletteShowcase.svelte'
  import AppShellShowcase from './showcases/AppShellShowcase.svelte'

  const pages = {
    tokens: TokensShowcase,
    buttons: ButtonsShowcase,
    segments: SegmentsShowcase,
    utilities: UtilitiesShowcase,
    modal: ModalShowcase,
    settings: SettingsShowcase,
    brand: BrandShowcase,
    navigation: NavigationShowcase,
    icon: IconShowcase,
    feedback: FeedbackShowcase,
    toast: ToastShowcase,
    cards: CardsShowcase,
    'explain-panel': ExplainPanelShowcase,
    'command-palette': CommandPaletteShowcase,
    'app-shell': AppShellShowcase,
  }

  let showcase = $state('tokens')
  let app = $state('planner')
  let mode = $state('light')
  let viewport = $state('desktop')
  let view = $state('detail')
  let embed = $state(false)
  let catalogState = $state('all')

  const ActivePage = $derived(pages[showcase])

  function syncFromUrl() {
    const state = readCatalogParams(new URLSearchParams(window.location.search))
    showcase = state.showcase
    app = state.app
    mode = state.mode
    viewport = state.viewport
    view = state.view
    embed = state.embed
    catalogState = state.state
  }

  function pushUrl(overrides = {}) {
    writeCatalogParams({
      showcase,
      app,
      mode,
      viewport,
      view,
      embed,
      state: catalogState,
      ...overrides,
    })
  }

  function setShowcase(id) {
    showcase = id
    catalogState = CATALOG_STATE_ALL
    pushUrl({ view: 'detail', state: CATALOG_STATE_ALL })
  }

  function openMatrix(currentShowcase = showcase) {
    showcase = currentShowcase
    view = 'matrix'
    catalogState = CATALOG_STATE_ALL
    pushUrl({ view: 'matrix', embed: false, state: CATALOG_STATE_ALL })
  }

  function openDetailFromMatrix(nextApp, nextMode, nextState) {
    app = nextApp
    mode = nextMode
    if (nextState) catalogState = nextState
    view = 'detail'
    pushUrl({ view: 'detail', embed: false, state: nextState ?? catalogState })
  }

  onMount(() => {
    syncFromUrl()
    const onPop = () => syncFromUrl()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  })
</script>

{#if embed}
  <div class="catalog-embed" data-testid="catalog-embed">
    <CatalogShell {app} {mode} state={catalogState}>
      {#if ActivePage}
        <ActivePage />
      {/if}
    </CatalogShell>
  </div>
{:else}
  <div class="catalog-app">
    <aside class="catalog-nav">
      <header class="catalog-nav__head">
        <h1>Life OS</h1>
        <p>Design Catalog</p>
      </header>
      <nav>
        <button
          type="button"
          class="catalog-nav__link"
          class:catalog-nav__link--active={view === 'matrix'}
          onclick={() => openMatrix(showcase)}
        >
          Matrix (states×4×2)
        </button>
        <p class="catalog-nav__group">@life-os/theme</p>
        {#each CATALOG_SECTIONS.filter((s) => s.group === 'theme') as section}
          <button
            type="button"
            class="catalog-nav__link"
            class:catalog-nav__link--active={view === 'detail' &&
              showcase === section.id}
            onclick={() => setShowcase(section.id)}
          >
            {section.label}
          </button>
        {/each}
        <p class="catalog-nav__group">@life-os/platform-web</p>
        {#each CATALOG_SECTIONS.filter((s) => s.group === 'components') as section}
          <button
            type="button"
            class="catalog-nav__link"
            class:catalog-nav__link--active={view === 'detail' &&
              showcase === section.id}
            onclick={() => setShowcase(section.id)}
          >
            {section.label}
          </button>
        {/each}
      </nav>
    </aside>

    <div class="catalog-workspace">
      {#if view === 'detail'}
        <ThemeMatrix
          {app}
          {mode}
          {viewport}
          {showcase}
          {catalogState}
          onApp={(v) => {
            app = v
            pushUrl()
          }}
          onMode={(v) => {
            mode = v
            pushUrl()
          }}
          onViewport={(v) => {
            viewport = v
            pushUrl()
          }}
          onState={(v) => {
            catalogState = v
            pushUrl({ state: v })
          }}
        />
      {/if}
      <main class="catalog-main">
        {#if view === 'matrix'}
          <CatalogMatrixView
            {showcase}
            onShowcase={(id) => {
              showcase = id
              pushUrl({ view: 'matrix' })
            }}
            onOpenDetail={openDetailFromMatrix}
          />
        {:else}
          <ResponsiveFrame {viewport}>
            <CatalogShell {app} {mode} state={catalogState}>
              {#if ActivePage}
                <ActivePage />
              {/if}
            </CatalogShell>
          </ResponsiveFrame>
        {/if}
      </main>
    </div>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    background: var(--catalog-chrome-bg);
  }

  .catalog-embed {
    min-height: 100vh;
    background: var(--bg, #eceae6);
  }

  .catalog-app {
    display: grid;
    grid-template-columns: 240px 1fr;
    min-height: 100vh;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  .catalog-workspace {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .catalog-nav {
    background: var(--catalog-chrome-surface);
    color: var(--catalog-chrome-text);
    padding: 20px 12px;
    border-right: 1px solid var(--catalog-chrome-border);
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
    box-sizing: border-box;
  }

  .catalog-nav__head h1 {
    margin: 0;
    font-size: 18px;
  }

  .catalog-nav__head p {
    margin: 4px 0 16px;
    font-size: 12px;
    color: var(--catalog-chrome-text-muted);
  }

  .catalog-nav__group {
    margin: 16px 8px 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--catalog-chrome-text-subtle);
  }

  .catalog-nav__link {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    color: var(--catalog-chrome-text-link);
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
  }

  .catalog-nav__link:hover {
    background: var(--catalog-chrome-surface-hover);
  }

  .catalog-nav__link--active {
    background: var(--catalog-chrome-surface-active);
    color: #fff;
  }

  .catalog-main {
    flex: 1;
    min-width: 0;
    background: var(--catalog-chrome-workspace-bg);
  }

  @media (max-width: 839px) {
    .catalog-app {
      grid-template-columns: 1fr;
    }
    .catalog-nav {
      position: static;
      height: auto;
    }
  }
</style>
