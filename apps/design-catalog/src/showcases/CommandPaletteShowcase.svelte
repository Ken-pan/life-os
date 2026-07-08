<script>
  import CommandPalette from '@life-os/platform-web/CommandPalette.svelte'
  import CommandPaletteEmptyFixture from '../fixtures/CommandPaletteEmptyFixture.svelte'
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  const actions = [
    {
      id: 'planner',
      title: 'Open Planner',
      subtitle: 'Tasks and calendar',
      icon: 'calendar',
      shortcut: '⌘1',
      onSelect: () => {},
    },
    {
      id: 'fitness',
      title: 'Open Fitness',
      subtitle: 'Workouts and progress',
      icon: 'dumbbell',
      shortcut: '⌘2',
      onSelect: () => {},
    },
    {
      id: 'finance',
      title: 'Open Finance',
      subtitle: 'Accounts and budgets',
      icon: 'wallet',
      shortcut: '⌘3',
      onSelect: () => {},
    },
    {
      id: 'music',
      title: 'Open Music',
      subtitle: 'Library and playlists',
      icon: 'music',
      shortcut: '⌘4',
      onSelect: () => {},
    },
  ]
</script>

<section class="catalog-section" data-testid="showcase-command-palette">
  <h2 class="catalog-section__title">Command palette</h2>
  <p class="catalog-section__lead">
    Portal launcher overlay from <code>@life-os/platform-web/CommandPalette.svelte</code>.
  </p>

  <div class="catalog-panel catalog-grid catalog-doc-preview catalog-doc-preview--palette">
    <CatalogStateBlock stateId="default" label="Default">
      <CommandPalette open={true} {actions} placeholder="Type a command or search..." />
    </CatalogStateBlock>

    <CatalogStateBlock stateId="empty" label="Empty results">
      <CommandPaletteEmptyFixture />
    </CatalogStateBlock>
  </div>
</section>

<style>
  .catalog-section {
    padding: 24px;
  }
  .catalog-section__title {
    margin: 0 0 8px;
    font-size: 22px;
  }
  .catalog-section__lead {
    margin: 0 0 20px;
    color: var(--t2, var(--text-secondary));
    font-size: 13px;
  }
</style>
