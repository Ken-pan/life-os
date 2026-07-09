<script>
  import { t } from '$lib/i18n.svelte.js'
  import { money } from '$lib/format.js'
  import { quoteSafeToSpend } from '@life-os/finance-core/copy/terminology'
  import {
    detectRecurringCandidates,
    normalizeAndReviewRows,
    parseCsv,
    suggestColumnMapping,
    validateImportFile,
  } from '$lib/engine/realityLoop'
  import { finalizeTransactionImport } from '$lib/repo.js'
  import { getTransactionsStore } from '$lib/transactions.svelte.js'
  import { trackFunnel, FUNNEL_EVENTS } from '$lib/analytics.js'
  import {
    buildImpactLines,
    flattenReviewItems,
    hashSimple,
    maskFileName,
    pickByFlag,
    showDelimiter,
  } from './reviewUtils.js'
  import StatChip from './StatChip.svelte'
  import BucketCard from './BucketCard.svelte'
  import IssueList from './IssueList.svelte'
  import MappingSelect from './MappingSelect.svelte'

  /** @typedef {1 | 2 | 3 | 4 | 5 | 6} WizardStep */

  /** @type {{ privacy: boolean, onImported: () => Promise<void> }} */
  let { privacy, onImported } = $props()

  const transactions = getTransactionsStore()

  /** @type {WizardStep} */
  let step = $state(1)
  let busy = $state(false)
  let error = $state(/** @type {string | null} */ (null))
  let validation = $state(/** @type {ReturnType<typeof validateImportFile> | null} */ (null))
  let parsed = $state(/** @type {import('$lib/engine/realityLoop').CsvParseResult | null} */ (null))
  let mapping = $state(/** @type {import('$lib/engine/realityLoop').ColumnMapping | null} */ (null))
  /** @type {import('$lib/engine/realityLoop').NormalizedTransactionDraft[]} */
  let drafts = $state([])
  let parseErrors = $state(/** @type {string[]} */ ([]))
  let completion = $state(/** @type {{ accepted: number, excluded: number, review: number } | null} */ (null))

  const recurring = $derived(detectRecurringCandidates(drafts))
  const summary = $derived({
    totalRows: drafts.length + parseErrors.length,
    acceptedRows: drafts.length,
    excludedRows: drafts.filter((r) => !r.includeInSpendingAnalytics).length,
    reviewRows: drafts.filter((r) => r.reviewFlags.length > 0).length,
  })
  const selectedRules = $derived(
    recurring.slice(0, 8).map((r) => ({
      match_type: /** @type {'exact'} */ ('exact'),
      match_value: r.merchantLabel,
      normalized_category: r.normalizedCategory,
      flow_type_override: /** @type {'expense'} */ ('expense'),
      include_in_spending_analytics_override: true,
    })),
  )
  const canPreview = $derived(Boolean(mapping?.date && mapping?.amount && mapping?.description))
  const impactLines = $derived(buildImpactLines(drafts, t))

  /** @param {File | null} file */
  async function onChooseFile(file) {
    if (!file) return
    error = null
    completion = null
    const raw = await file.text()
    const nextValidation = validateImportFile(file.name, file.size, raw)
    validation = nextValidation
    if (nextValidation.errors.length > 0) {
      parsed = null
      return
    }
    const parsedCsv = parseCsv(raw, nextValidation.delimiter)
    parsed = parsedCsv
    const suggested = suggestColumnMapping(parsedCsv.headers)
    mapping = {
      date: suggested.date ?? '',
      amount: suggested.amount ?? '',
      description: suggested.description ?? '',
      originalDate: suggested.originalDate,
      merchantName: suggested.merchantName,
      category: suggested.category,
      accountName: suggested.accountName,
      accountNumber: suggested.accountNumber,
      institution: suggested.institution,
      accountType: suggested.accountType,
      ignoredFrom: suggested.ignoredFrom,
      amountSign: 'negative_is_outflow',
    }
    step = 2
    trackFunnel(FUNNEL_EVENTS.reviewImportStarted)
  }

  function runPreview() {
    if (!parsed || !mapping || !canPreview) return
    const normalized = normalizeAndReviewRows(parsed, mapping)
    drafts = normalized.drafts
    parseErrors = normalized.parseErrors
    step = 3
  }

  async function finalize() {
    if (!validation || !mapping) return
    busy = true
    error = null
    try {
      const payload = {
        sourceFileNameMasked: maskFileName(validation.fileName),
        sourceFileHash: `csv_${hashSimple(validation.fileName + validation.fileSize + validation.rowCount)}`,
        schemaVersion: 1,
        rawRowCount: validation.rowCount,
        acceptedRows: drafts.map((r) => ({
          occurred_on: r.occurredOn,
          original_date: r.originalDate,
          source_account_label: r.sourceAccountLabel,
          source_account_masked: r.sourceAccountMasked,
          institution: r.institution,
          account_type: r.accountType,
          merchant_name: r.merchantName,
          description: r.description,
          source_category: r.sourceCategory,
          normalized_category: r.normalizedCategory,
          source_amount: r.sourceAmount,
          budget_impact: r.budgetImpact,
          net_worth_impact: r.netWorthImpact,
          account_balance_impact: r.accountBalanceImpact,
          flow_type: r.flowType,
          include_in_spending_analytics: r.includeInSpendingAnalytics,
          include_in_cash_flow_history: r.includeInCashFlowHistory,
          review_status: r.reviewStatus,
          review_flags: r.reviewFlags,
          transaction_fingerprint: r.transactionFingerprint,
        })),
        reviewItems: flattenReviewItems(drafts),
        merchantRules: selectedRules,
      }
      const result = await finalizeTransactionImport(payload)
      completion = {
        accepted: result.acceptedRowCount,
        excluded: result.excludedRowCount,
        review: result.reviewRowCount,
      }
      await transactions.reload()
      await onImported()
      step = 6
      trackFunnel(FUNNEL_EVENTS.reviewImportFinalized, {
        accepted: result.acceptedRowCount,
        review: result.reviewRowCount,
      })
    } catch (e) {
      error = e instanceof Error ? e.message : t('review.importFailed')
    } finally {
      busy = false
    }
  }
</script>

<div class="card">
  <div class="card-head">
    <h3>{t('review.importTitle')}</h3>
    <span class="text-muted">{t('review.stepOf', { step })}</span>
  </div>
  <p class="muted-note">{t('review.importPrivacyNote')}</p>
  {#if error}
    <div class="banner">{error}</div>
  {/if}

  {#if step === 1}
    <div class="grid gap-3">
      <label class="field">
        <span>{t('review.selectCsv')}</span>
        <input
          class="input"
          type="file"
          accept=".csv,text/csv"
          onchange={(e) => {
            const file = e.currentTarget.files?.[0] ?? null
            void onChooseFile(file)
          }}
        />
      </label>
      {#if validation}
        <div class="grid kpi-row-4">
          <StatChip label={t('review.statFileName')} value={maskFileName(validation.fileName)} />
          <StatChip
            label={t('review.statSize')}
            value={`${(validation.fileSize / 1024).toFixed(1)} KB`}
          />
          <StatChip label={t('review.statDelimiter')} value={showDelimiter(validation.delimiter)} />
          <StatChip label={t('review.statRowCount')} value={validation.rowCount.toLocaleString()} />
        </div>
      {/if}
      {#if validation?.errors.length}
        <ul class="muted-note">
          {#each validation.errors as msg (msg)}
            <li>{msg}</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  {#if step === 2 && parsed && mapping}
    <div class="grid gap-3">
      <p class="muted-note">
        {t('review.mappingRequired', {
          signRule:
            mapping.amountSign === 'negative_is_outflow'
              ? t('review.signNegativeOutflow')
              : t('review.signPositiveOutflow'),
        })}
      </p>
      <div class="grid cols-2">
        <MappingSelect
          label={t('review.mapDate')}
          value={mapping.date}
          headers={parsed.headers}
          onChange={(v) => {
            mapping = { ...mapping, date: v }
          }}
        />
        <MappingSelect
          label={t('review.mapAmount')}
          value={mapping.amount}
          headers={parsed.headers}
          onChange={(v) => {
            mapping = { ...mapping, amount: v }
          }}
        />
        <MappingSelect
          label={t('review.mapDescription')}
          value={mapping.description}
          headers={parsed.headers}
          onChange={(v) => {
            mapping = { ...mapping, description: v }
          }}
        />
        <MappingSelect
          label={t('review.mapMerchant')}
          value={mapping.merchantName ?? ''}
          headers={parsed.headers}
          onChange={(v) => {
            mapping = { ...mapping, merchantName: v || undefined }
          }}
        />
        <MappingSelect
          label={t('review.mapCategory')}
          value={mapping.category ?? ''}
          headers={parsed.headers}
          onChange={(v) => {
            mapping = { ...mapping, category: v || undefined }
          }}
        />
        <MappingSelect
          label={t('review.mapAccount')}
          value={mapping.accountName ?? ''}
          headers={parsed.headers}
          onChange={(v) => {
            mapping = { ...mapping, accountName: v || undefined }
          }}
        />
      </div>
      <div class="row">
        <label class="field">
          <span>{t('review.amountSign')}</span>
          <select
            class="input"
            value={mapping.amountSign}
            onchange={(e) => {
              mapping = {
                ...mapping,
                amountSign: /** @type {import('$lib/engine/realityLoop').ColumnMapping['amountSign']} */ (
                  e.currentTarget.value
                ),
              }
            }}
          >
            <option value="negative_is_outflow">{t('review.signOptionNegative')}</option>
            <option value="positive_is_outflow">{t('review.signOptionPositive')}</option>
          </select>
        </label>
      </div>
      <div class="card card-compact">
        <h3>{t('review.previewTitle')}</h3>
        <div class="life-os-scroll-x">
          <table class="review-table">
            <thead>
              <tr>
                {#each parsed.headers as h (h)}
                  <th>{h}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each parsed.rows.slice(0, 10) as r, i (i)}
                <tr>
                  {#each parsed.headers as h, j (`${h}-${j}`)}
                    <td>{r[j] ?? ''}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
      <div class="row">
        <button class="btn ghost" type="button" onclick={() => (step = 1)}>
          {t('review.prev')}
        </button>
        <button class="btn" type="button" disabled={!canPreview} onclick={runPreview}>
          {t('review.continuePreview')}
        </button>
      </div>
    </div>
  {/if}

  {#if step === 3}
    <div class="grid gap-3">
      <div class="grid kpi-row-4">
        <StatChip label={t('review.statTotalRows')} value={summary.totalRows.toLocaleString()} />
        <StatChip label={t('review.statAcceptedRows')} value={summary.acceptedRows.toLocaleString()} />
        <StatChip label={t('review.statExcludedRows')} value={summary.excludedRows.toLocaleString()} />
        <StatChip label={t('review.statReviewRows')} value={summary.reviewRows.toLocaleString()} />
      </div>
      <div class="grid cols-2">
        <BucketCard title={t('review.bucketHighImpact')} lines={impactLines} />
        <BucketCard
          title={t('review.bucketRecurring')}
          lines={recurring.slice(0, 5).map((r) =>
            t('review.recurringLine', {
              merchant: r.merchantLabel,
              count: r.occurrences,
              amount: money(r.averageAmount, privacy),
            }),
          )}
        />
      </div>
      <p class="muted-note">
        {t('review.importNoBalanceNote', { safeToSpend: quoteSafeToSpend() })}
      </p>
      <div class="row">
        <button class="btn ghost" type="button" onclick={() => (step = 2)}>
          {t('review.prev')}
        </button>
        <button class="btn" type="button" onclick={() => (step = 4)}>
          {t('review.reviewHighValue')}
        </button>
      </div>
    </div>
  {/if}

  {#if step === 4}
    <div class="grid gap-3">
      <IssueList
        title={t('review.issueMirror')}
        rows={pickByFlag(drafts, 'mirror_duplicate_candidate')}
        {privacy}
      />
      <IssueList
        title={t('review.issueTransfer')}
        rows={pickByFlag(drafts, 'likely_transfer', 'likely_credit_card_payment')}
        {privacy}
      />
      <IssueList
        title={t('review.issueUncategorized')}
        rows={pickByFlag(drafts, 'large_uncategorized')}
        {privacy}
      />
      <IssueList
        title={t('review.issueRecurring')}
        rows={pickByFlag(drafts, 'likely_recurring')}
        {privacy}
      />
      <div class="row">
        <button class="btn ghost" type="button" onclick={() => (step = 3)}>
          {t('review.prev')}
        </button>
        <button class="btn" type="button" onclick={() => (step = 5)}>
          {t('review.continueConfirm')}
        </button>
      </div>
    </div>
  {/if}

  {#if step === 5}
    <div class="grid gap-3">
      <div class="grid kpi-row-4">
        <StatChip label={t('review.statToWrite')} value={drafts.length.toLocaleString()} />
        <StatChip
          label={t('review.statExcludedAnalytics')}
          value={drafts.filter((r) => !r.includeInSpendingAnalytics).length.toLocaleString()}
        />
        <StatChip
          label={t('review.statOpenReview')}
          value={flattenReviewItems(drafts)
            .filter((i) => i.status === 'open')
            .length.toLocaleString()}
        />
        <StatChip label={t('review.statRecurringSuggestions')} value={recurring.length.toLocaleString()} />
      </div>
      <p class="muted-note">
        {t('review.importConfirmNote', { safeToSpend: quoteSafeToSpend() })}
      </p>
      <div class="row">
        <button class="btn ghost" type="button" onclick={() => (step = 4)}>
          {t('review.prev')}
        </button>
        <button class="btn ghost" type="button" onclick={() => (step = 1)}>
          {t('common.cancel')}
        </button>
        <button class="btn" type="button" disabled={busy} onclick={() => void finalize()}>
          {busy ? t('review.importing') : t('review.importAccepted')}
        </button>
      </div>
    </div>
  {/if}

  {#if step === 6 && completion}
    <div class="grid gap-3">
      <div class="grid kpi-row-4">
        <StatChip label={t('review.statAcceptedTxns')} value={completion.accepted.toLocaleString()} />
        <StatChip label={t('review.statExcludedTxns')} value={completion.excluded.toLocaleString()} />
        <StatChip label={t('review.statRemainingReview')} value={completion.review.toLocaleString()} />
        <StatChip
          label={t('review.statBaselineStatus')}
          value={completion.accepted > 0 ? t('review.baselineAvailable') : t('review.baselineEmpty')}
        />
      </div>
      <div class="row">
        <button class="btn ghost" type="button" onclick={() => (step = 1)}>
          {t('review.continueImport')}
        </button>
        <button class="btn" type="button" onclick={() => void onImported()}>
          {t('review.viewBaseline')}
        </button>
      </div>
    </div>
  {/if}
</div>
