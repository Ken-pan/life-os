<script>
  import { onMount } from 'svelte'
  import { CATALOG_SECTIONS } from '$lib/catalogNav.js'
  import { readCatalogParams, writeCatalogParams } from '$lib/catalogState.js'
  import ThemeMatrix from '$lib/ThemeMatrix.svelte'
  import ResponsiveFrame from '$lib/ResponsiveFrame.svelte'
  import CatalogShell from '$lib/CatalogShell.svelte'
  import TokensShowcase from './showcases/TokensShowcase.svelte'
  import ButtonsShowcase from './showcases/ButtonsShowcase.svelte'
  import SegmentsShowcase from './showcases/SegmentsShowcase.svelte'
  import UtilitiesShowcase from './showcases/UtilitiesShowcase.svelte'
  import SettingsShowcase from './showcases/SettingsShowcase.svelte'
  import BrandShowcase from './showcases/BrandShowcase.svelte'
  import NavigationShowcase from './showcases/NavigationShowcase.svelte'
  import IconShowcase from './showcases/IconShowcase.svelte'
  import FeedbackShowcase from './showcases/FeedbackShowcase.svelte'
  import ToastShowcase from './showcases/ToastShowcase.svelte'

  const pages = {
    tokens: TokensShowcase,
    buttons: ButtonsShowcase,
    segments: SegmentsShowcase,
    utilities: UtilitiesShowcase,
    settings: SettingsShowcase,
    brand: BrandShowcase,
    navigation: NavigationShowcase,
    icon: IconShowcase,
    feedback: FeedbackShowcase,
    toast: ToastShowcase,
  }

  let showcase = $state('tokens')
  let app = $state('planner')
  let mode = $state('light')
  let viewport = $state('desktop')

  const ActivePage = $derived(pages[showcase])

  function syncFromUrl() {
    const state = readCatalogParams(new URLSearchParams(window.location.search))
    showcase = state.showcase
    app = state.app
    mode = state.mode
    viewport = state.viewport
  }

  function pushUrl() {
    writeCatalogParams({ showcase, app, mode, viewport })
  }

  function setShowcase(id) {
    showcase = id
    pushUrl()
  }

  onMount(() => {
    syncFromUrl()
    const onPop = () => syncFromUrl()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  })
</script>

<div class="catalog-app">
  <aside class="catalog-nav">
    <header class="catalog-nav__head">
      <h1>Life OS</h1>
      <p>Design Catalog</p>
    </header>
    <nav>
      <p class="catalog-nav__group">@life-os/theme</p>
      {#each CATALOG_SECTIONS.filter((s) => s.group === 'theme') as section}
        <button
          type="button"
          class="catalog-nav__link"
          class:catalog-nav__link--active={showcase === section.id}
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
          class:catalog-nav__link--active={showcase === section.id}
          onclick={() => setShowcase(section.id)}
        >
          {section.label}
        </button>
      {/each}
    </nav>
  </aside>

  <div class="catalog-workspace">
    <ThemeMatrix
      {app}
      {mode}
      {viewport}
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
    />
    <main class="catalog-main">
      <ResponsiveFrame {viewport}>
        <CatalogShell {app} {mode}>
          {#if ActivePage}
            <ActivePage />
          {/if}
        </CatalogShell>
      </ResponsiveFrame>
    </main>
  </div>
</div>

<style>
  :global(body) {
    margin: 0;
    background: #111;
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
    background: #161616;
    color: #f2f2f2;
    padding: 20px 12px;
    border-right: 1px solid #2a2a2a;
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
    color: #9a9a9a;
  }

  .catalog-nav__group {
    margin: 16px 8px 6px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #7a7a7a;
  }

  .catalog-nav__link {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    background: transparent;
    color: #d8d8d8;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
  }

  .catalog-nav__link:hover {
    background: #242424;
  }

  .catalog-nav__link--active {
    background: #2d2d2d;
    color: #fff;
  }

  .catalog-main {
    flex: 1;
    min-width: 0;
    background: #eceae6;
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
