<script>
  import {
    Card,
    CardActions,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardMedia,
    CardTitle,
  } from '@life-os/platform-web/svelte/card'
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  const variants = /** @type {const} */ ([
    'surface',
    'elevated',
    'subtle',
    'ghost',
  ])
</script>

<section class="catalog-section" data-testid="showcase-cards">
  <h2 class="catalog-section__title">Cards</h2>
  <p class="catalog-section__lead">
    Primitive from <code>@life-os/platform-web/svelte/card</code> — token-driven, no app
    coupling. Interactive cards render as a single button; do not nest actions inside them.
  </p>

  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="surface" label="surface">
      <Card variant="surface" density="comfortable">
        <CardHeader>
          <CardTitle>Monthly overview</CardTitle>
          <CardDescription>Tokenized card primitive preview</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Body content uses component tokens for spacing and text color.</p>
        </CardContent>
        <CardFooter>Updated just now</CardFooter>
      </Card>
    </CatalogStateBlock>

    {#each variants.filter((v) => v !== 'surface') as variant (variant)}
      <CatalogStateBlock stateId="detail:{variant}" label={variant}>
        <Card {variant} density="comfortable">
          <CardHeader>
            <CardTitle>Monthly overview</CardTitle>
            <CardDescription>Tokenized card primitive preview</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Body content uses component tokens for spacing and text color.</p>
          </CardContent>
          <CardFooter>Updated just now</CardFooter>
        </Card>
      </CatalogStateBlock>
    {/each}
  </div>

  <h3 class="catalog-subtitle">A — Whole-card interaction</h3>
  <p class="catalog-section__hint">
    <code>interactive</code> cards are a single button. No <code>CardActions</code>, links, or
    nested controls.
  </p>
  <div class="catalog-panel catalog-grid catalog-grid--states">
    <CatalogStateBlock stateId="interactive" label="interactive">
      <Card variant="surface" interactive density="comfortable">
        <CardHeader>
          <CardTitle>Interactive card</CardTitle>
          <CardDescription>Entire surface is one button</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Tap anywhere on the card to activate.</p>
        </CardContent>
      </Card>
    </CatalogStateBlock>
    <CatalogStateBlock stateId="detail:selected" label="selected">
      <Card variant="surface" interactive selected density="comfortable">
        <CardHeader>
          <CardTitle>Selected card</CardTitle>
          <CardDescription>aria-pressed when interactive</CardDescription>
        </CardHeader>
      </Card>
    </CatalogStateBlock>
    <CatalogStateBlock stateId="disabled" label="disabled (interactive)">
      <Card variant="surface" interactive disabled density="comfortable">
        <CardHeader>
          <CardTitle>Disabled interactive</CardTitle>
          <CardDescription>Native button disabled</CardDescription>
        </CardHeader>
      </Card>
    </CatalogStateBlock>
  </div>

  <h3 class="catalog-subtitle">B — Card with actions</h3>
  <p class="catalog-section__hint">
    Non-interactive root. Put buttons and links in <code>CardActions</code>.
  </p>
  <div class="catalog-panel catalog-grid catalog-grid--states">
    <CatalogStateBlock stateId="detail:actions" label="actions">
      <Card variant="surface" density="comfortable">
        <CardHeader>
          <CardTitle>Review queue</CardTitle>
          <CardDescription>Multiple actions on a static card</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Card root stays non-interactive.</p>
        </CardContent>
        <CardActions>
          <button type="button" class="btn-secondary">Dismiss</button>
          <button type="button" class="btn-primary">Open</button>
        </CardActions>
      </Card>
    </CatalogStateBlock>
    <CatalogStateBlock stateId="detail:static-disabled" label="disabled (visual)">
      <Card variant="surface" disabled density="comfortable">
        <CardHeader>
          <CardTitle>Disabled static card</CardTitle>
          <CardDescription>Visual-only disabled state</CardDescription>
        </CardHeader>
      </Card>
    </CatalogStateBlock>
    <CatalogStateBlock stateId="detail:comfortable" label="comfortable">
      <Card variant="surface" density="comfortable">
        <CardHeader>
          <CardTitle>Comfortable density</CardTitle>
        </CardHeader>
        <CardContent>Default padding from --card-padding.</CardContent>
      </Card>
    </CatalogStateBlock>
    <CatalogStateBlock stateId="detail:compact" label="compact + media">
      <Card variant="elevated" density="compact">
        <CardMedia>
          <div class="catalog-card-media-placeholder" aria-hidden="true"></div>
        </CardMedia>
        <CardHeader>
          <CardTitle>Compact density</CardTitle>
        </CardHeader>
        <CardActions>
          <button type="button" class="btn-secondary">Action</button>
        </CardActions>
      </Card>
    </CatalogStateBlock>
  </div>
</section>

<style>
  .catalog-section {
    padding: 24px;
  }
  .catalog-section__title {
    margin: 0 0 8px;
    font-size: var(--text-2xl);
  }
  .catalog-section__lead {
    margin: 0 0 20px;
    color: var(--t2, var(--text-secondary));
    font-size: var(--text-base);
  }
  .catalog-section__hint {
    margin: -4px 0 12px;
    color: var(--t3, var(--text-muted));
    font-size: var(--text-md);
  }
  .catalog-subtitle {
    margin: 28px 0 12px;
    font-size: var(--text-xl);
  }
  .catalog-grid {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
  .catalog-grid--states {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }
  .catalog-card-media-placeholder {
    aspect-ratio: 16 / 9;
    background: color-mix(in srgb, var(--accent) 12%, var(--card));
  }
</style>
