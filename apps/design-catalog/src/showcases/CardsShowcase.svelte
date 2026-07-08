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
    {#each variants as variant (variant)}
      <div class="catalog-state-block">
        <p class="catalog-state-label">{variant}</p>
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
      </div>
    {/each}
  </div>

  <h3 class="catalog-subtitle">A — Whole-card interaction</h3>
  <p class="catalog-section__hint">
    <code>interactive</code> cards are a single button. No <code>CardActions</code>, links, or
    nested controls.
  </p>
  <div class="catalog-panel catalog-grid catalog-grid--states">
    <div class="catalog-state-block">
      <p class="catalog-state-label">interactive</p>
      <Card variant="surface" interactive density="comfortable">
        <CardHeader>
          <CardTitle>Interactive card</CardTitle>
          <CardDescription>Entire surface is one button</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Tap anywhere on the card to activate.</p>
        </CardContent>
      </Card>
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">selected</p>
      <Card variant="surface" interactive selected density="comfortable">
        <CardHeader>
          <CardTitle>Selected card</CardTitle>
          <CardDescription>aria-pressed when interactive</CardDescription>
        </CardHeader>
      </Card>
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">disabled (interactive)</p>
      <Card variant="surface" interactive disabled density="comfortable">
        <CardHeader>
          <CardTitle>Disabled interactive</CardTitle>
          <CardDescription>Native button disabled</CardDescription>
        </CardHeader>
      </Card>
    </div>
  </div>

  <h3 class="catalog-subtitle">B — Card with actions</h3>
  <p class="catalog-section__hint">
    Non-interactive root. Put buttons and links in <code>CardActions</code>.
  </p>
  <div class="catalog-panel catalog-grid catalog-grid--states">
    <div class="catalog-state-block">
      <p class="catalog-state-label">actions</p>
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
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">disabled (visual)</p>
      <Card variant="surface" disabled density="comfortable">
        <CardHeader>
          <CardTitle>Disabled static card</CardTitle>
          <CardDescription>Visual-only disabled state</CardDescription>
        </CardHeader>
      </Card>
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">comfortable</p>
      <Card variant="surface" density="comfortable">
        <CardHeader>
          <CardTitle>Comfortable density</CardTitle>
        </CardHeader>
        <CardContent>Default padding from --card-padding.</CardContent>
      </Card>
    </div>
    <div class="catalog-state-block">
      <p class="catalog-state-label">compact + media</p>
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
    </div>
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
    font-size: 14px;
  }
  .catalog-section__hint {
    margin: -4px 0 12px;
    color: var(--t3, var(--text-muted));
    font-size: 13px;
  }
  .catalog-subtitle {
    margin: 28px 0 12px;
    font-size: 16px;
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
