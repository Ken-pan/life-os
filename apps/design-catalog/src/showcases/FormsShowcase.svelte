<script>
  import {
    TextField,
    NumberField,
    SelectField,
    TextareaField,
    DateField,
    DateTriggerField,
    SearchField,
  } from '@life-os/platform-web/svelte/form'
  import CatalogStateBlock from '../lib/CatalogStateBlock.svelte'

  let text = $state('Barbell bench press')
  let amount = $state(62.5)
  let category = $state('strength')
  let notes = $state('')
  let date = $state('2026-07-15')
  let triggerDate = $state(null)
  let query = $state('bench press')
  let emptyQuery = $state('')

  const categoryOptions = [
    { value: 'strength', label: 'Strength' },
    { value: 'cardio', label: 'Cardio' },
    { value: 'mobility', label: 'Mobility' },
  ]
</script>

<section class="catalog-section" data-testid="showcase-forms">
  <h2 class="catalog-section__title">Forms</h2>
  <p class="catalog-section__lead">
    表单字段原语，来自 <code>@life-os/platform-web/svelte/form</code>：
    <code>TextField</code> · <code>NumberField</code> · <code>SelectField</code> ·
    <code>TextareaField</code> · <code>DateField</code> · <code>DateTriggerField</code>。
    外观走 theme 的 <code>.field</code> 族；label/for、aria-invalid、错误行内置。
  </p>

  <div class="catalog-panel catalog-grid">
    <CatalogStateBlock stateId="default" label="Text / Number / Select / Textarea">
      <div class="catalog-forms-col">
        <TextField
          label="Exercise"
          value={text}
          onChange={(v) => (text = v)}
          placeholder="Name"
        />
        <NumberField
          label="Weight"
          value={amount}
          onChange={(v) => (amount = v)}
          step={2.5}
          suffix="kg"
        />
        <SelectField
          label="Category"
          value={category}
          options={categoryOptions}
          onChange={(v) => (category = v)}
        />
        <TextareaField
          label="Notes"
          value={notes}
          onChange={(v) => (notes = v)}
          placeholder="Optional cues…"
        />
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="date" label="DateField / DateTriggerField">
      <div class="catalog-forms-col">
        <DateField
          label="Due date (native)"
          value={date}
          onChange={(v) => (date = v)}
          note="2026年7月15日"
        />
        <div class="field">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label>Scheduled (trigger)</label>
          <DateTriggerField
            value={triggerDate}
            display={triggerDate ?? 'Pick a date'}
            placeholder={!triggerDate}
            onchange={(v) => (triggerDate = v)}
          />
        </div>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="search" label="SearchField">
      <div class="catalog-forms-col">
        <SearchField
          label="Library"
          value={query}
          onChange={(v) => (query = v)}
          placeholder="Search exercises…"
        />
        <SearchField
          value={emptyQuery}
          onChange={(v) => (emptyQuery = v)}
          placeholder="Search…"
        />
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="upload" label="Dropzone (.dropzone)">
      <div class="catalog-forms-col">
        <button type="button" class="dropzone" style="width: 100%">
          <svg
            class="dropzone__icon"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 16V4m0 0 4 4m-4-4-4 4" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          <span>拖入文件，或点击选择</span>
          <span class="dropzone__hint">JSON / CSV · 最大 10MB</span>
        </button>
        <button type="button" class="dropzone dropzone--active" style="width: 100%">
          <span>松手即导入（拖入态 .dropzone--active）</span>
        </button>
      </div>
    </CatalogStateBlock>

    <CatalogStateBlock stateId="error" label="Hint / Error / Disabled">
      <div class="catalog-forms-col">
        <TextField
          label="Email"
          value="not-an-email"
          onChange={() => {}}
          error="请输入有效邮箱"
        />
        <TextField
          label="API key"
          value=""
          onChange={() => {}}
          placeholder="sk-…"
          hint="仅保存在本机"
        />
        <TextField label="Locked" value="read only" onChange={() => {}} disabled />
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
  .catalog-forms-col {
    max-width: 360px;
  }
</style>
