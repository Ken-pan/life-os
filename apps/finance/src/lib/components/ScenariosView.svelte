<script>
  // Port of src/components/ScenariosView.tsx.
  import { t, intlLocaleTag } from '$lib/i18n.svelte.js'
  import { getFinanceStore, uid } from '$lib/finance.svelte.js'
  import { computeProjection } from '$lib/projection.js'
  import { projectDaily } from '../../engine/daily.js'
  import { selectMonthlySavingCapacity } from '../../engine/metrics.js'
  import { isMilestoneGoal } from '../../engine/goals.js'
  import { scenarioStatusLabel } from '../../copy/terminology.js'
  import SelectField from './fields/SelectField.svelte'
  import TextField from './fields/TextField.svelte'
  import SortBySelect from './SortBySelect.svelte'
  import ScenariosEventRow from './ScenariosEventRow.svelte'
  import ScenariosGoalRow from './ScenariosGoalRow.svelte'
  import ScenariosSavingsBudgetCard from './ScenariosSavingsBudgetCard.svelte'
  import { defaultEvent, eventTypeOptions } from '$lib/scenarios.js'

  const store = getFinanceStore()

  let draftBudget = $state(/** @type {number | null} */ (null))
  let scenarioSort = $state(/** @type {'timeline' | 'name' | 'type'} */ ('timeline'))
  let goalSort = $state(/** @type {'logic' | 'target-asc' | 'target-desc' | 'name'} */ ('logic'))

  const eventTypes = $derived(eventTypeOptions(t))
  const events = $derived(store.data.events)
  const goals = $derived(store.data.goals)
  const scenarios = $derived(store.data.scenarios ?? [])
  const activeScenarioId = $derived(store.data.activeScenarioId ?? scenarios[0]?.id)
  const activeScenario = $derived(
    scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0] ?? null,
  )
  const projection = $derived(computeProjection(store.data))
  const scenarioEvents = $derived(
    events.filter(
      (e) =>
        e.eventType === 'salary-change' ||
        e.eventType === 'expense-change' ||
        e.eventType === 'partner-contribution',
    ),
  )
  const reserveGoals = $derived(goals.filter((g) => !isMilestoneGoal(g)))
  const intlLoc = $derived(intlLocaleTag())
  const sortedGoals = $derived(
    goals.slice().sort((a, b) => {
      if (goalSort === 'target-asc') return a.target - b.target
      if (goalSort === 'target-desc') return b.target - a.target
      if (goalSort === 'name') return a.name.localeCompare(b.name, intlLoc)
      const reserveDelta = Number(!isMilestoneGoal(b)) - Number(!isMilestoneGoal(a))
      if (reserveDelta !== 0) return reserveDelta
      const targetDelta = a.target - b.target
      if (targetDelta !== 0) return targetDelta
      return a.name.localeCompare(b.name, intlLoc)
    }),
  )
  const sortedScenarioEvents = $derived(
    scenarioEvents.slice().sort((a, b) => {
      if (scenarioSort === 'name') return a.name.localeCompare(b.name, intlLoc)
      if (scenarioSort === 'type') {
        const typeDelta = a.eventType.localeCompare(b.eventType, intlLoc)
        if (typeDelta !== 0) return typeDelta
      }
      return a.monthOffset - b.monthOffset
    }),
  )
  const surplus = $derived(Math.max(0, Math.round(projection.summary.monthlySurplus)))
  const reserveAllocSum = $derived(
    reserveGoals.reduce((s, g) => s + (g.monthlyAllocation ?? 0), 0),
  )
  const recommendedBudget = $derived(
    Math.round(
      selectMonthlySavingCapacity({
        outlook: projectDaily(store.data),
        assumptions: store.data.assumptions,
        goals: store.data.goals,
      }).capacity,
    ),
  )
  const committedBudget = $derived(
    store.data.assumptions.savingsBudget ??
      (reserveAllocSum > 0
        ? reserveAllocSum
        : recommendedBudget > 0
          ? recommendedBudget
          : surplus),
  )
  const effBudget = $derived(draftBudget ?? committedBudget)

  /** @param {number} next */
  function commitBudget(next) {
    store.setAssumptions({ savingsBudget: next })
    if (committedBudget > 0) {
      for (const g of reserveGoals) {
        const pct = (g.monthlyAllocation ?? 0) / committedBudget
        const nextAlloc = Math.round(pct * next)
        if (nextAlloc !== (g.monthlyAllocation ?? 0)) {
          store.upsertGoal({ ...g, monthlyAllocation: nextAlloc })
        }
      }
    }
    draftBudget = null
  }
</script>

<div class="grid gap-4">
  <div class="card card-compact">
    <div class="row">
      <SelectField
        label={t('scenarios.currentScenario')}
        value={activeScenarioId ?? ''}
        options={scenarios.map((s) => ({
          value: s.id,
          label: `${s.name}${s.status === 'saved' ? '' : t('scenarios.scenarioStatusWrap', { status: scenarioStatusLabel(s.status) })}`,
        }))}
        onChange={(id) => store.setActiveScenario(id)}
      />
      <TextField
        label={t('scenarios.scenarioName')}
        value={activeScenario?.name ?? ''}
        onChange={(name) => {
          if (!activeScenario) return
          store.upsertScenario({ ...activeScenario, name, updatedAt: new Date().toISOString() })
        }}
      />
      <div class="field field-actions">
        <label>&nbsp;</label>
        <div class="flex-row-tight">
          <button
            class="btn ghost"
            onclick={() => {
              const id = uid('scn')
              store.upsertScenario({
                id,
                name: t('scenarios.newScenarioDefault'),
                scenarioType: 'custom',
                status: 'draft',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              })
              store.setActiveScenario(id)
            }}
          >
            {t('scenarios.newScenario')}
          </button>
          <button class="btn ghost" onclick={() => store.duplicateActiveScenario()}>
            {t('scenarios.duplicate')}
          </button>
          <button
            class="btn ghost"
            disabled={!activeScenario}
            onclick={() => {
              if (!activeScenario) return
              store.upsertScenario({
                ...activeScenario,
                status: 'saved',
                updatedAt: new Date().toISOString(),
              })
            }}
          >
            {t('scenarios.save')}
          </button>
          <button
            class="btn danger"
            disabled={!activeScenario || activeScenario.id === 'scenario_baseline'}
            onclick={() => {
              if (!activeScenario) return
              if (!window.confirm(t('scenarios.deleteScenarioConfirm', { name: activeScenario.name }))) return
              store.removeScenario(activeScenario.id)
            }}
          >
            {t('scenarios.deleteScenario')}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div>
    <h2 class="section-title">{t('scenarios.longTermTitle')}</h2>
    <p class="muted-note">{t('scenarios.longTermIntro')}</p>
    <div class="chart-controls">
      {#each eventTypes as opt (opt.value)}
        <button class="icon-btn" onclick={() => store.upsertEvent(defaultEvent(opt.value, t))}>
          {t('scenarios.addEvent', { label: opt.label })}
        </button>
      {/each}
      <SortBySelect
        label={t('scenarios.sort')}
        value={scenarioSort}
        onChange={(v) => (scenarioSort = /** @type {typeof scenarioSort} */ (v))}
        options={[
          { id: 'timeline', label: t('scenarios.sortTimeline') },
          { id: 'type', label: t('scenarios.sortType') },
          { id: 'name', label: t('scenarios.sortName') },
        ]}
      />
    </div>
    <div class="grid gap-3">
      {#if scenarioEvents.length === 0}
        <div class="empty">{t('scenarios.longTermEmpty')}</div>
      {/if}
      {#each sortedScenarioEvents as e (e.id)}
        <ScenariosEventRow {e} />
      {/each}
    </div>
  </div>

  <div>
    <h2 class="section-title">{t('scenarios.goalsTitle')}</h2>
    <p class="muted-note">{t('scenarios.goalsIntro')}</p>
    <ScenariosSavingsBudgetCard
      {effBudget}
      {committedBudget}
      {surplus}
      {recommendedBudget}
      {reserveGoals}
      onChange={(v) => (draftBudget = v)}
      onCommit={commitBudget}
    />
    <div class="chart-controls mt-3">
      <button
        class="icon-btn"
        onclick={() =>
          store.upsertGoal({
            id: uid('goal'),
            name: t('scenarios.newGoalDefault'),
            metric: 'net-worth',
            target: 100000,
            reservePolicy: 'milestone_only',
            reserve: false,
          })}
      >
        {t('scenarios.addMilestone')}
      </button>
      <button
        class="icon-btn"
        onclick={() =>
          store.upsertGoal({
            id: uid('goal'),
            name: t('scenarios.newSavingsGoalDefault'),
            metric: 'liquid',
            target: 10000,
            current: 0,
            monthlyAllocation: 0,
            reservePolicy: 'earmarked_operating_cash',
            reserve: true,
          })}
      >
        {t('scenarios.addSavingsGoal')}
      </button>
      <SortBySelect
        label={t('scenarios.sort')}
        value={goalSort}
        onChange={(v) => (goalSort = /** @type {typeof goalSort} */ (v))}
        options={[
          { id: 'logic', label: t('scenarios.sortLogic') },
          { id: 'target-asc', label: t('scenarios.sortTargetAsc') },
          { id: 'target-desc', label: t('scenarios.sortTargetDesc') },
          { id: 'name', label: t('scenarios.sortName') },
        ]}
      />
    </div>
    <div class="grid gap-3">
      {#each sortedGoals as g (g.id)}
        <ScenariosGoalRow {g} {effBudget} {committedBudget} {reserveAllocSum} />
      {/each}
    </div>
  </div>
</div>
