<script>
  // Port of src/components/DecisionStudioView.tsx.
  import { t } from '$lib/i18n.svelte.js'
  import { getFinanceStore, uid, BASELINE_SCENARIO_ID } from '$lib/finance.svelte.js'
  import { formatDateTimeForIntl, money, signedMoney } from '$lib/format.js'
  import { selectDecisionComparison } from '../../engine/decision.js'
  import { safeToSpendLabel } from '../../copy/metrics.js'
  import {
    getDecisionConfidenceLabels,
    decisionStatusLabel,
    scenarioStatusLabel,
    scenarioTypeLabel,
  } from '../../copy/terminology.js'
  import DateField from './fields/DateField.svelte'
  import NumberField from './fields/NumberField.svelte'
  import PercentField from './fields/PercentField.svelte'
  import SelectField from './fields/SelectField.svelte'
  import TextField from './fields/TextField.svelte'
  import * as repo from '$lib/repo.js'
  import {
    LifeOsTabs as HorizontalTabs,
    LifeOsTabPanel as TabPanel,
  } from '@life-os/platform-web/svelte/tabs'
  import {
    getTemplates,
    getTemplateFieldConfig,
    getAdvancedFieldLabels,
    estimatedFinancePayment,
    describeTemplateInput,
    decisionStatusOptions,
    scenarioTypeFromTemplate,
    buildTemplateEvents,
    eventDisplayType,
    previewRowFromEvent,
  } from '$lib/decisionStudio.js'

  /** @typedef {import('$lib/appRoute').DecisionSection} DecisionSection */
  /** @typedef {import('../../types.js').DecisionRecord} DecisionRecord */
  /** @typedef {import('../../types.js').DecisionStatus} DecisionStatus */
  /** @typedef {import('../../types.js').Scenario} Scenario */
  /** @typedef {import('../../types.js').ScenarioEvent} ScenarioEvent */
  /** @typedef {import('../../engine/decision.js').DecisionComparison} DecisionComparison */
  /** @typedef {import('$lib/decisionStudio.js').TemplateType} TemplateType */

  /** @type {{ active?: DecisionSection, onChange?: (section: DecisionSection) => void }} */
  let { active, onChange } = $props()

  const store = getFinanceStore()

  /** @typedef {'compare' | 'saved' | 'log'} StudioTab */

  let internalTab = $state(/** @type {StudioTab} */ ('compare'))
  const tab = $derived(active ?? internalTab)

  /** @param {StudioTab} next */
  function setTab(next) {
    onChange?.(next)
    if (!onChange) internalTab = next
  }

  let template = $state(/** @type {TemplateType} */ ('purchase'))
  let amount = $state(2000)
  let monthlyAmount = $state(300)
  let startDate = $state('')
  let apr = $state(0.08)
  let termMonths = $state(12)
  let downPayment = $state(500)
  let moveCost = $state(800)
  let partnerPercent = $state(0.3)
  let advancedOpen = $state(false)
  let previewEvents = $state(/** @type {ScenarioEvent[]} */ ([]))
  let previewComparison = $state(/** @type {DecisionComparison | null} */ (null))
  let selectedIds = $state(/** @type {string[]} */ ([]))
  let selectedComparisons = $state(
    /** @type {Array<{ scenario: Scenario, comparison: DecisionComparison }>} */ ([]),
  )
  let records = $state(/** @type {DecisionRecord[]} */ ([]))
  let recordScenarioId = $state('')
  let recordStatus = $state(/** @type {DecisionStatus} */ ('considering'))
  let recordSummary = $state('')
  let recordReason = $state('')
  let recordReviewOn = $state('')
  let search = $state('')
  let filterType = $state('all')
  let filterStatus = $state('all')
  let applyScenarioId = $state('')
  let applyEvents = $state(/** @type {ScenarioEvent[]} */ ([]))
  let applySelectedIds = $state(/** @type {string[]} */ ([]))
  let applyAck = $state(false)
  let staleAck = $state(false)
  let applyBusy = $state(false)
  let undoBusy = $state(false)
  let applyMessage = $state(/** @type {string | null} */ (null))

  const privacy = $derived(store.data.privacy)
  const templates = $derived(getTemplates(t))
  const templateFieldConfig = $derived(getTemplateFieldConfig(t))
  const advancedFieldLabels = $derived(getAdvancedFieldLabels(t))
  const scenarios = $derived((store.data.scenarios ?? []).filter((s) => s.status !== 'archived'))
  const savedScenarios = $derived(scenarios.filter((s) => s.id !== BASELINE_SCENARIO_ID))
  const studioSections = $derived([
    { id: /** @type {const} */ ('compare'), label: t('decisionStudio.tabCompare') },
    { id: /** @type {const} */ ('saved'), label: t('decisionStudio.tabSaved') },
    { id: /** @type {const} */ ('log'), label: t('decisionStudio.tabLog') },
  ])
  const fieldConfig = $derived(templateFieldConfig[template])
  const inputSummary = $derived(
    describeTemplateInput(t, {
      template,
      amount,
      monthlyAmount,
      startDate: startDate || undefined,
      apr,
      termMonths,
      downPayment,
      moveCost,
      partnerPercent,
      privacy: store.data.privacy,
    }),
  )
  const filteredScenarios = $derived(
    savedScenarios.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
      if (filterType !== 'all' && s.scenarioType !== filterType) return false
      if (filterStatus !== 'all' && s.status !== filterStatus) return false
      return true
    }),
  )
  const applyPreviewRows = $derived.by(() => {
    const scenarioName =
      savedScenarios.find((s) => s.id === applyScenarioId)?.name ??
      t('decisionStudio.selectedScenarioFallback')
    return applyEvents
      .filter((e) => applySelectedIds.includes(e.id))
      .map((e) => previewRowFromEvent(t, e, scenarioName, store.data.privacy))
  })

  $effect(() => {
    previewEvents = []
    previewComparison = null
    if (!fieldConfig.advanced?.length) advancedOpen = false
  })

  $effect(() => {
    void repo
      .loadDecisionRecords()
      .then((rows) => {
        records = rows
      })
      .catch((e) => console.error('[decision] load records failed', e))
  })

  $effect(() => {
    if (!recordScenarioId && savedScenarios[0]?.id) {
      recordScenarioId = savedScenarios[0].id
    }
  })

  $effect(() => {
    if (!applyScenarioId && savedScenarios.length > 0) {
      applyScenarioId = savedScenarios[0].id
    }
  })

  $effect(() => {
    const picked = selectedIds.slice(0, 3)
    if (picked.length === 0) {
      selectedComparisons = []
      return
    }
    let cancelled = false
    void (async () => {
      /** @type {Array<{ scenario: Scenario, comparison: DecisionComparison }>} */
      const out = []
      for (const id of picked) {
        const scenario = savedScenarios.find((s) => s.id === id)
        if (!scenario) continue
        const events = await repo.loadScenarioEvents(id)
        const comparison = selectDecisionComparison({
          data: store.data,
          baselineEvents: [],
          scenarioEvents: events,
        })
        out.push({ scenario, comparison })
      }
      if (!cancelled) selectedComparisons = out
    })().catch((e) => console.error('[decision] compare saved failed', e))
    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    if (!applyScenarioId) {
      applyEvents = []
      applySelectedIds = []
      return
    }
    let cancelled = false
    void repo
      .loadScenarioEvents(applyScenarioId)
      .then((events) => {
        if (cancelled) return
        applyEvents = events
        applySelectedIds = events.map((e) => e.id)
      })
      .catch((e) => console.error('[decision] load apply scenario events failed', e))
    return () => {
      cancelled = true
    }
  })

  function runPreview() {
    const events = buildTemplateEvents(t, {
      template,
      amount,
      monthlyAmount,
      startDate: startDate || undefined,
      apr,
      termMonths,
      downPayment,
      moveCost,
      partnerPercent,
    })
    previewEvents = events
    previewComparison = selectDecisionComparison({
      data: store.data,
      baselineEvents: [],
      scenarioEvents: events,
    })
  }

  function savePreviewAsScenario() {
    if (previewEvents.length === 0) return
    const id = uid('scn')
    /** @type {Scenario} */
    const scenario = {
      id,
      name: `${templates.find((tpl) => tpl.id === template)?.label ?? t('decisionStudio.saveNameFallback')} ${new Date()
        .toISOString()
        .slice(5, 10)}`,
      scenarioType: scenarioTypeFromTemplate(template),
      status: 'saved',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    store.upsertScenario(scenario)
    for (const e of previewEvents) {
      void repo.upsertEvent({ ...e, scenarioId: id }, id)
    }
  }

  async function recordDecision() {
    /** @type {DecisionRecord} */
    const row = {
      id: uid('dr'),
      scenarioId: recordScenarioId,
      decisionStatus: recordStatus,
      decisionSummary: recordSummary || t('decisionStudio.defaultDecisionSummary'),
      reason: recordReason || undefined,
      reviewOn: recordReviewOn || undefined,
      decidedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    await repo.upsertDecisionRecord(row)
    records = [row, ...records]
    recordSummary = ''
    recordReason = ''
  }

  async function applyToPlan() {
    if (!applyScenarioId || applySelectedIds.length === 0) return
    applyBusy = true
    applyMessage = null
    try {
      const result = await repo.applyScenarioToPlan(applyScenarioId, applySelectedIds)
      applyMessage = t('decisionStudio.applySuccess', {
        date: formatDateTimeForIntl(result.appliedAt),
        count: result.appliedCount,
      })
      store.setActiveScenario(BASELINE_SCENARIO_ID)
      const s = savedScenarios.find((x) => x.id === applyScenarioId)
      if (s) {
        store.upsertScenario({
          ...s,
          status: 'chosen',
          updatedAt: new Date().toISOString(),
        })
      }
      await repo.upsertDecisionRecord({
        id: uid('dr'),
        scenarioId: applyScenarioId,
        decisionStatus: 'chosen',
        decisionSummary: t('decisionStudio.appliedDecisionSummary'),
        decidedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    } catch (e) {
      applyMessage = e instanceof Error ? e.message : t('decisionStudio.applyFailed')
    } finally {
      applyBusy = false
    }
  }

  async function undoLatestApply() {
    undoBusy = true
    applyMessage = null
    try {
      const result = await repo.undoLatestScenarioApply()
      applyMessage = t('decisionStudio.undoSuccess', {
        date: formatDateTimeForIntl(result.undoneAt),
        count: result.undoneCount,
      })
      store.setActiveScenario(BASELINE_SCENARIO_ID)
    } catch (e) {
      applyMessage = e instanceof Error ? e.message : t('decisionStudio.undoFailed')
    } finally {
      undoBusy = false
    }
  }
</script>

{#snippet comparisonCard(title, c, priv)}
  <div class="card card-compact">
    <h3>{title}</h3>
    <div class="grid kpi-row-4">
      <div class="item">
        <div class="meta">{safeToSpendLabel()}</div>
        <div class="name">{money(c.scenario.safeToSpendToday, priv)}</div>
        <div class={c.delta.safeToSpendToday >= 0 ? 'text-pos' : 'text-neg'}>
          {signedMoney(c.delta.safeToSpendToday, priv)}
        </div>
      </div>
      <div class="item">
        <div class="meta">{t('decisionStudio.compare.lowestCash30d')}</div>
        <div class="name">{money(c.scenario.lowestProjectedOperatingCash30d, priv)}</div>
        <div
          class={c.delta.lowestProjectedOperatingCash30d >= 0 ? 'text-pos' : 'text-neg'}
        >
          {signedMoney(c.delta.lowestProjectedOperatingCash30d, priv)}
        </div>
      </div>
      <div class="item">
        <div class="meta">{t('decisionStudio.compare.monthlySurplus')}</div>
        <div class="name">{money(c.scenario.monthlySurplus, priv)}</div>
        <div class={c.delta.monthlySurplus >= 0 ? 'text-pos' : 'text-neg'}>
          {signedMoney(c.delta.monthlySurplus, priv)}
        </div>
      </div>
      <div class="item">
        <div class="meta">{t('decisionStudio.compare.netWorth10yDelta')}</div>
        <div class={c.delta.netWorth10y >= 0 ? 'text-pos' : 'text-neg'}>
          {signedMoney(c.delta.netWorth10y, priv)}
        </div>
        <div class="meta">
          {t('decisionStudio.compare.confidence', {
            label: getDecisionConfidenceLabels()[c.confidence],
          })}
        </div>
      </div>
    </div>
    {#if c.warnings.length > 0}
      <ul class="muted-note mt-2">
        {#each c.warnings as w (w.code)}
          <li>{w.message}</li>
        {/each}
      </ul>
    {/if}
  </div>
{/snippet}

<div class="grid gap-4">
  <HorizontalTabs
    items={studioSections}
    activeId={tab}
    onChange={(id) => setTab(/** @type {StudioTab} */ (id))}
    ariaLabel={t('decisionStudio.sectionAria')}
  >
    <TabPanel tabId="compare" active={tab === 'compare'}>
      <div class="grid gap-3">
        <div class="card card-compact">
          <h3>{t('decisionStudio.step1Title')}</h3>
          <SelectField
            label={t('decisionStudio.questionType')}
            value={template}
            options={templates.map((tpl) => ({ value: tpl.id, label: tpl.label }))}
            onChange={(v) => {
              template = /** @type {TemplateType} */ (v)
            }}
          />
          <p class="muted-note mt-1 mb-3">{fieldConfig.summary}</p>
          <div class="row">
            {#if fieldConfig.amount}
              <div class="field field-flex">
                <NumberField
                  label={fieldConfig.amount.optional
                    ? `${fieldConfig.amount.label}${t('decisionStudio.optional')}`
                    : fieldConfig.amount.label}
                  value={amount}
                  onChange={(v) => {
                    amount = v
                  }}
                  step={fieldConfig.amount.isMonthlyAmount ? 50 : 100}
                  suffix={fieldConfig.amount.suffix}
                />
                <p class="muted-note mt-1">{fieldConfig.amount.hint}</p>
              </div>
            {/if}
            {#if fieldConfig.monthly}
              <div class="field field-flex">
                <NumberField
                  label={fieldConfig.monthly.optional
                    ? `${fieldConfig.monthly.label}${t('decisionStudio.optional')}`
                    : fieldConfig.monthly.label}
                  value={monthlyAmount}
                  onChange={(v) => {
                    monthlyAmount = v
                  }}
                  step={50}
                  suffix={fieldConfig.monthly.suffix}
                />
                <p class="muted-note mt-1">
                  {fieldConfig.monthly.hint}
                  {#if template === 'cash_vs_finance' && monthlyAmount <= 0 && amount > downPayment}
                    {' '}{t('decisionStudio.autoEstimate', {
                      amount: money(
                        Math.round(
                          estimatedFinancePayment({ amount, downPayment, apr, termMonths }),
                        ),
                        store.data.privacy,
                      ),
                    })}
                  {/if}
                </p>
              </div>
            {/if}
            {#if fieldConfig.partnerPercent}
              <div class="field field-flex">
                <PercentField
                  label={fieldConfig.partnerPercent.label}
                  value={partnerPercent}
                  onChange={(v) => {
                    partnerPercent = v
                  }}
                />
                <p class="muted-note mt-1">{fieldConfig.partnerPercent.hint}</p>
              </div>
            {/if}
            {#if fieldConfig.startDate}
              <div class="field field-flex">
                <DateField
                  label={fieldConfig.startDate.label}
                  value={startDate}
                  onChange={(v) => {
                    startDate = v ?? ''
                  }}
                />
                <p class="muted-note mt-1">{fieldConfig.startDate.hint}</p>
              </div>
            {/if}
          </div>
          {#if fieldConfig.advanced && fieldConfig.advanced.length > 0}
            <button class="icon-btn" onclick={() => (advancedOpen = !advancedOpen)}>
              {advancedOpen
                ? t('decisionStudio.collapseAdvanced')
                : t('decisionStudio.expandAdvanced')}
            </button>
            {#if advancedOpen}
              <div class="row mt-2">
                {#if fieldConfig.advanced.includes('downPayment')}
                  <div class="field field-flex-compact">
                    <NumberField
                      label={advancedFieldLabels.downPayment.label}
                      value={downPayment}
                      onChange={(v) => {
                        downPayment = v
                      }}
                      step={100}
                      suffix={advancedFieldLabels.downPayment.suffix}
                    />
                    <p class="muted-note mt-1">{advancedFieldLabels.downPayment.hint}</p>
                  </div>
                {/if}
                {#if fieldConfig.advanced.includes('apr')}
                  <div class="field field-flex-compact">
                    <PercentField
                      label={advancedFieldLabels.apr.label}
                      value={apr}
                      onChange={(v) => {
                        apr = v
                      }}
                    />
                    <p class="muted-note mt-1">{advancedFieldLabels.apr.hint}</p>
                  </div>
                {/if}
                {#if fieldConfig.advanced.includes('termMonths')}
                  <div class="field field-flex-compact">
                    <NumberField
                      label={advancedFieldLabels.termMonths.label}
                      value={termMonths}
                      onChange={(v) => {
                        termMonths = v
                      }}
                      suffix={advancedFieldLabels.termMonths.suffix}
                    />
                    <p class="muted-note mt-1">{advancedFieldLabels.termMonths.hint}</p>
                  </div>
                {/if}
                {#if fieldConfig.advanced.includes('moveCost')}
                  <div class="field field-flex-compact">
                    <NumberField
                      label={advancedFieldLabels.moveCost.label}
                      value={moveCost}
                      onChange={(v) => {
                        moveCost = v
                      }}
                      step={100}
                      suffix={advancedFieldLabels.moveCost.suffix}
                    />
                    <p class="muted-note mt-1">{advancedFieldLabels.moveCost.hint}</p>
                  </div>
                {/if}
              </div>
            {/if}
          {/if}
          <div class="item inset-panel">
            <div class="meta mb-1">{t('decisionStudio.willSimulate')}</div>
            <ul>
              {#each inputSummary as line (line)}
                <li class="name text-base">{line}</li>
              {/each}
            </ul>
          </div>
          <div class="row mt-3">
            <button class="btn" onclick={runPreview}>{t('decisionStudio.previewScenario')}</button>
            <button
              class="btn ghost"
              onclick={savePreviewAsScenario}
              disabled={previewEvents.length === 0}
            >
              {t('decisionStudio.saveScenario')}
            </button>
          </div>
        </div>

        {#if previewComparison}
          {@render comparisonCard(t('decisionStudio.step2Title'), previewComparison, privacy)}
        {/if}

        {#if previewComparison}
          <div class="card card-compact">
            <h3>{t('decisionStudio.step3Title')}</h3>
            <div class="row">
              {#each savedScenarios.slice(0, 12) as s (s.id)}
                <label class="item" style="min-width: 180px">
                  <input
                    class="checkbox"
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onchange={(e) => {
                      if (e.currentTarget.checked) {
                        selectedIds = [...selectedIds, s.id].slice(0, 3)
                      } else {
                        selectedIds = selectedIds.filter((id) => id !== s.id)
                      }
                    }}
                  />
                  <span class="name">{s.name}</span>
                </label>
              {/each}
            </div>
            <p class="muted-note mt-2">{t('decisionStudio.compareTagsNote')}</p>
          </div>
        {/if}

        {#if previewComparison}
          {#each selectedComparisons as entry (entry.scenario.id)}
            {@render comparisonCard(entry.scenario.name, entry.comparison, privacy)}
          {/each}
        {/if}

        {#if previewComparison}
          <div class="card card-compact">
            <h3>{t('decisionStudio.step4Title')}</h3>
            <div class="row">
              <SelectField
                label={t('decisionStudio.sourceScenario')}
                value={applyScenarioId}
                options={savedScenarios.map((s) => ({ value: s.id, label: s.name }))}
                onChange={(v) => {
                  applyScenarioId = v
                }}
              />
            </div>
            <div class="list">
              {#each applyEvents as e (e.id)}
                <label class="item">
                  <input
                    class="checkbox"
                    type="checkbox"
                    checked={applySelectedIds.includes(e.id)}
                    onchange={(ev) => {
                      if (ev.currentTarget.checked) {
                        applySelectedIds = [...applySelectedIds, e.id]
                      } else {
                        applySelectedIds = applySelectedIds.filter((id) => id !== e.id)
                      }
                    }}
                  />
                  <div class="grow">
                    <div class="name">{e.name}</div>
                    <div class="meta">
                      {eventDisplayType(t, e)} ·
                      {e.date ??
                        t('decisionStudio.preview.monthOffset', { offset: e.monthOffset })}
                    </div>
                  </div>
                </label>
              {/each}
            </div>
            <div class="life-os-scroll-x mt-2">
              <table class="review-table">
                <thead>
                  <tr>
                    <th>{t('decisionStudio.colPlannedItem')}</th>
                    <th>{t('decisionStudio.colCurrentValue')}</th>
                    <th>{t('decisionStudio.colProposedValue')}</th>
                    <th>{t('decisionStudio.colEffectiveDate')}</th>
                    <th>{t('decisionStudio.colSourceScenario')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each applyPreviewRows as r (r.eventId)}
                    <tr>
                      <td>{r.plannedItem}</td>
                      <td>{r.currentValue}</td>
                      <td>{r.proposedValue}</td>
                      <td>{r.effectiveDate}</td>
                      <td>{r.sourceScenario}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            <label class="item mt-2">
              <input
                class="checkbox"
                type="checkbox"
                checked={applyAck}
                onchange={(e) => {
                  applyAck = e.currentTarget.checked
                }}
              />
              <span>{t('decisionStudio.applyAck')}</span>
            </label>
            {#if previewComparison && previewComparison.confidence !== 'Ready to compare'}
              <label class="item">
                <input
                  class="checkbox"
                  type="checkbox"
                  checked={staleAck}
                  onchange={(e) => {
                    staleAck = e.currentTarget.checked
                  }}
                />
                <span>{t('decisionStudio.staleAck')}</span>
              </label>
            {/if}
            <div class="row mt-2">
              <button class="btn ghost" onclick={() => void undoLatestApply()} disabled={undoBusy}>
                {undoBusy ? t('decisionStudio.undoBusy') : t('decisionStudio.undoLatest')}
              </button>
              <button
                class="btn"
                disabled={applyBusy ||
                  applySelectedIds.length === 0 ||
                  !applyAck ||
                  (previewComparison?.confidence !== 'Ready to compare' && !staleAck)}
                onclick={() => void applyToPlan()}
              >
                {applyBusy ? t('decisionStudio.applyBusy') : t('decisionStudio.applySelected')}
              </button>
            </div>
            {#if applyMessage}
              <p class="muted-note mt-2">{applyMessage}</p>
            {/if}
          </div>
        {/if}
      </div>
    </TabPanel>

    <TabPanel tabId="saved" active={tab === 'saved'}>
      <div class="grid gap-3">
        <div class="card card-compact">
          <div class="row">
            <TextField label={t('decisionStudio.search')} value={search} onChange={(v) => (search = v)} />
            <SelectField
              label={t('decisionStudio.filterByType')}
              value={filterType}
              options={[
                { value: 'all', label: t('decisionStudio.filterAllTypes') },
                { value: 'purchase', label: t('terminology.scenarioTypePurchase') },
                { value: 'recurring_cost', label: t('terminology.scenarioTypeRecurringCost') },
                { value: 'rent_change', label: t('terminology.scenarioTypeRentChange') },
                { value: 'travel', label: t('terminology.scenarioTypeTravel') },
                { value: 'career_break', label: t('terminology.scenarioTypeCareerBreak') },
                {
                  value: 'partner_contribution',
                  label: t('terminology.scenarioTypePartnerContribution'),
                },
                { value: 'cash_vs_finance', label: t('terminology.scenarioTypeCashVsFinance') },
              ]}
              onChange={(v) => {
                filterType = v
              }}
            />
            <SelectField
              label={t('decisionStudio.filterByStatus')}
              value={filterStatus}
              options={[
                { value: 'all', label: t('decisionStudio.filterAllStatuses') },
                { value: 'draft', label: t('terminology.scenarioStatusDraft') },
                { value: 'saved', label: t('terminology.scenarioStatusSaved') },
                { value: 'chosen', label: t('terminology.scenarioStatusChosen') },
                { value: 'archived', label: t('terminology.scenarioStatusArchived') },
              ]}
              onChange={(v) => {
                filterStatus = v
              }}
            />
          </div>
        </div>
        {#each filteredScenarios as s (s.id)}
          <div class="card card-compact">
            <div class="row">
              <TextField
                label={t('decisionStudio.scenarioName')}
                value={s.name}
                onChange={(name) =>
                  store.upsertScenario({
                    ...s,
                    name,
                    updatedAt: new Date().toISOString(),
                  })}
              />
              <div class="field">
                <label>{t('decisionStudio.type')}</label>
                <div class="input">{scenarioTypeLabel(s.scenarioType)}</div>
              </div>
              <div class="field">
                <label>{t('decisionStudio.status')}</label>
                <div class="input">{scenarioStatusLabel(s.status)}</div>
              </div>
              <div class="field field-actions">
                <label>&nbsp;</label>
                <div class="flex-row-tight">
                  <button class="btn ghost" onclick={() => store.setActiveScenario(s.id)}>
                    {t('decisionStudio.open')}
                  </button>
                  <button
                    class="btn ghost"
                    onclick={() =>
                      store.upsertScenario({
                        ...s,
                        status: s.status === 'archived' ? 'saved' : 'archived',
                        updatedAt: new Date().toISOString(),
                        archivedAt:
                          s.status === 'archived' ? undefined : new Date().toISOString(),
                      })}
                  >
                    {s.status === 'archived'
                      ? t('decisionStudio.unarchive')
                      : t('decisionStudio.archive')}
                  </button>
                  <button
                    class="btn danger"
                    onclick={() => {
                      if (window.confirm(t('decisionStudio.confirmDeleteScenario', { name: s.name })))
                        store.removeScenario(s.id)
                    }}
                  >
                    {t('decisionStudio.delete')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        {:else}
          <div class="card card-compact">
            <p class="muted-note mb-0">{t('decisionStudio.savedEmpty')}</p>
          </div>
        {/each}
      </div>
    </TabPanel>

    <TabPanel tabId="log" active={tab === 'log'}>
      <div class="grid gap-3">
        <div class="card card-compact">
          <h3>{t('decisionStudio.recordDecision')}</h3>
          <div class="row">
            <SelectField
              label={t('decisionStudio.scenario')}
              value={recordScenarioId}
              options={savedScenarios.map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => {
                recordScenarioId = v
              }}
            />
            <SelectField
              label={t('decisionStudio.decision')}
              value={recordStatus}
              options={decisionStatusOptions()}
              onChange={(v) => {
                recordStatus = /** @type {DecisionStatus} */ (v)
              }}
            />
            <DateField
              label={t('decisionStudio.reviewDate')}
              value={recordReviewOn}
              onChange={(v) => {
                recordReviewOn = v ?? ''
              }}
            />
          </div>
          <div class="row">
            <TextField
              label={t('decisionStudio.conclusion')}
              value={recordSummary}
              onChange={(v) => {
                recordSummary = v
              }}
              placeholder={t('decisionStudio.conclusionPlaceholder')}
            />
            <TextField
              label={t('decisionStudio.reason')}
              value={recordReason}
              onChange={(v) => {
                recordReason = v
              }}
              placeholder={t('decisionStudio.reasonPlaceholder')}
            />
          </div>
          <button class="btn" onclick={() => void recordDecision()}>
            {t('decisionStudio.recordDecision')}
          </button>
        </div>
        {#each records as r (r.id)}
          {@const scenario = savedScenarios.find((s) => s.id === r.scenarioId)}
          <div class="card card-compact">
            <div class="row">
              <div class="item grow">
                <div class="name">{r.decisionSummary}</div>
                <div class="meta">
                  {scenario?.name ?? t('decisionStudio.unknownScenario')} ·
                  {decisionStatusLabel(r.decisionStatus)} · {r.decidedAt?.slice(0, 10)}
                </div>
                {#if r.reason}
                  <div class="meta">{r.reason}</div>
                {/if}
              </div>
              <div class="flex-row-tight">
                <button
                  class="btn danger"
                  onclick={() => {
                    if (!window.confirm(t('decisionStudio.confirmDeleteRecord'))) return
                    void repo.deleteDecisionRecord(r.id)
                    records = records.filter((x) => x.id !== r.id)
                  }}
                >
                  {t('decisionStudio.delete')}
                </button>
              </div>
            </div>
          </div>
        {:else}
          <div class="card card-compact">
            <p class="muted-note mb-0">{t('decisionStudio.logEmpty')}</p>
          </div>
        {/each}
      </div>
    </TabPanel>
  </HorizontalTabs>
</div>
