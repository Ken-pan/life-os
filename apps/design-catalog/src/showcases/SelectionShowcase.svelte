<script>
  import {
    CheckboxField,
    RadioGroupField,
    SliderField,
    QuantityStepper,
  } from '@life-os/platform-web/svelte/form'
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  let syncEnabled = $state(true)
  let notifyEnabled = $state(false)
  let plan = $state('weekly')
  let volume = $state(60)
  let qty = $state(2)
  let sets = $state(3)

  const planOptions = [
    { value: 'daily', label: 'Daily', description: 'Runs every morning' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'manual', label: 'Manual only' },
  ]
</script>

<section class="catalog-section" data-testid="showcase-selection">
  <h2 class="catalog-section__title">Selection controls</h2>
  <p class="catalog-section__lead">
    选择控件，来自 <code>@life-os/platform-web/svelte/form</code>：
    <code>CheckboxField</code> · <code>RadioGroupField</code> ·
    <code>SliderField</code>。外观走 theme 的 <code>.checkbox</code> /
    <code>.radio</code> / <code>.option-row</code> / <code>.slider</code> 族。
  </p>

  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="default" label="Checkbox / Radio / Slider">
      <div class="catalog-selection-col">
        <CheckboxField
          label="Cloud sync"
          description="Last synced 5 min ago"
          checked={syncEnabled}
          onChange={(v) => (syncEnabled = v)}
        />
        <CheckboxField
          label="Notifications"
          checked={notifyEnabled}
          onChange={(v) => (notifyEnabled = v)}
        />
        <RadioGroupField
          label="Backup cadence"
          value={plan}
          options={planOptions}
          onChange={(v) => (plan = v)}
        />
        <SliderField
          label="Volume"
          value={volume}
          onChange={(v) => (volume = v)}
          min={0}
          max={100}
          step={5}
          format={(v) => `${v}%`}
          hint="Applies to previews only"
        />
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="stepper" label="QuantityStepper">
      <div class="catalog-selection-col catalog-stepper-col">
        <QuantityStepper
          label="Quantity"
          value={qty}
          onChange={(v) => (qty = v)}
          min={1}
          max={9}
        />
        <QuantityStepper
          label="Sets"
          value={sets}
          onChange={(v) => (sets = v)}
          min={1}
          max={10}
          format={(v) => `${v} 组`}
        />
        <QuantityStepper label="Locked" value={1} onChange={() => {}} disabled />
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="disabled" label="Disabled">
      <div class="catalog-selection-col">
        <CheckboxField label="Locked on" checked onChange={() => {}} disabled />
        <CheckboxField label="Locked off" checked={false} onChange={() => {}} disabled />
        <RadioGroupField
          label="Cadence (locked)"
          value="weekly"
          options={planOptions}
          onChange={() => {}}
          disabled
        />
        <SliderField
          label="Volume (locked)"
          value={30}
          onChange={() => {}}
          min={0}
          max={100}
          disabled
        />
      </div>
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
    font-size: var(--text-sm);
  }
  .catalog-selection-col {
    max-width: 360px;
  }
  .catalog-stepper-col {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
</style>
