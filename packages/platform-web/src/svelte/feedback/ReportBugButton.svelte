<script>
  import { onMount } from 'svelte'

  let {
    app = 'portal',
    supabase = null,
    user = null,
    toast = null,
    onSubmit = null,
  } = $props()

  let isOpen = $state(false)
  let title = $state('')
  let notes = $state('')
  let severity = $state('medium')
  let screenshot = $state(null) // File object
  let screenshotPreviewUrl = $state('')
  let errorMsg = $state('')
  let successState = $state(false)
  let successMode = $state('remote')

  let savedScrollY = 0

  function portal(node) {
    if (typeof document === 'undefined') return {}
    document.body.appendChild(node)
    return {
      destroy() {
        if (node.parentNode) node.parentNode.removeChild(node)
      }
    }
  }

  function enableScrollLock() {
    if (typeof window === 'undefined') return
    savedScrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${savedScrollY}px`
    document.body.style.width = '100%'
    document.body.classList.add('lifeos-bug-report-open')
  }

  function disableScrollLock() {
    if (typeof window === 'undefined') return
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.width = ''
    document.body.classList.remove('lifeos-bug-report-open')
    window.scrollTo(0, savedScrollY)
  }

  // Diagnostics metadata compiler
  function getDiagnostics() {
    if (typeof window === 'undefined') return {}
    return {
      app,
      route: window.location.pathname + window.location.search,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setScreenshotFile(file)
  }

  function setScreenshotFile(file) {
    errorMsg = ''
    if (!file.type.startsWith('image/')) {
      errorMsg = 'Only image files are allowed.'
      return
    }
    if (file.size > 6 * 1024 * 1024) {
      errorMsg = 'File size must not exceed 6MB.'
      return
    }
    screenshot = file
    if (screenshotPreviewUrl) {
      URL.revokeObjectURL(screenshotPreviewUrl)
    }
    screenshotPreviewUrl = URL.createObjectURL(file)
  }

  function handlePaste(e) {
    if (!isOpen) return
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          setScreenshotFile(file)
          e.preventDefault()
          break
        }
      }
    }
  }

  function handleWindowKeyDown(e) {
    if (e.key === 'Escape') {
      closeSheet()
    }
  }

  function openSheet() {
    isOpen = true
    title = ''
    notes = ''
    severity = 'medium'
    screenshot = null
    screenshotPreviewUrl = ''
    errorMsg = ''
    successState = false
    successMode = 'remote'
    enableScrollLock()
  }

  function closeSheet() {
    isOpen = false
    disableScrollLock()
    if (screenshotPreviewUrl) {
      URL.revokeObjectURL(screenshotPreviewUrl)
      screenshotPreviewUrl = ''
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    errorMsg = ''

    if (!title.trim()) {
      errorMsg = 'Title is required.'
      return
    }

    if (onSubmit) {
      try {
        await onSubmit({ title, notes, severity, screenshot, diagnostics: getDiagnostics() })
        successMode = 'remote'
        successState = true
        if (toast) {
          toast('Bug report submitted successfully.', 'success')
        }
      } catch (err) {
        errorMsg = err.message || 'Submission failed'
      }
      return
    }

    if (!supabase) {
      // Local simulation fallback
      const payload = {
        title: title.trim(),
        notes: notes.trim(),
        severity,
        diagnostics: getDiagnostics(),
        screenshotName: screenshot ? screenshot.name : null,
        screenshotSize: screenshot ? screenshot.size : null,
        screenshotType: screenshot ? screenshot.type : null,
      }
      console.log('[ReportBugButton] Local simulation payload:', payload)
      successMode = 'local'
      successState = true
      if (toast) {
        toast('Bug reported successfully (local simulation).', 'success')
      }
      return
    }

    try {
      let screenshotPath = null
      let currentUser = user
      if (!currentUser) {
        const { data: { user: authUser } } = await supabase.auth.getUser()
        currentUser = authUser
      }
      if (!currentUser) {
        errorMsg = 'You must be signed in to report bugs.'
        return
      }

      const bugId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`

      if (screenshot) {
        const ext = screenshot.name.split('.').pop() || 'png'
        screenshotPath = `${currentUser.id}/bugs/${bugId}.${ext}`
        
        const { error: uploadError } = await supabase.storage
          .from('bug-attachments')
          .upload(screenshotPath, screenshot, {
            cacheControl: '3600',
            upsert: true
          })
        
        if (uploadError) {
          throw uploadError
        }
      }

      const diagnostics = getDiagnostics()

      const { error: insertError } = await supabase
        .from('bug_logs')
        .insert({
          id: bugId,
          user_id: currentUser.id,
          app,
          route: diagnostics.route,
          title: title.trim(),
          notes: notes.trim(),
          screenshot_path: screenshotPath,
          severity,
          status: 'open',
          user_agent: diagnostics.userAgent,
          viewport_width: diagnostics.viewportWidth,
          viewport_height: diagnostics.viewportHeight,
          device_pixel_ratio: diagnostics.devicePixelRatio,
          console_summary: '',
          error_message: '',
          error_stack: '',
          metadata: {}
        })

      if (insertError) {
        // Rollback storage upload if DB insert fails
        if (screenshotPath) {
          await supabase.storage.from('bug-attachments').remove([screenshotPath])
        }
        throw insertError
      }

      successMode = 'remote'
      successState = true
      if (toast) {
        toast('Bug report submitted successfully.', 'success')
      }
    } catch (err) {
      console.error('[ReportBugButton] Failed to submit bug report:', err)
      errorMsg = err.message || 'An error occurred while submitting the report.'
    }
  }

  onMount(() => {
    return () => {
      disableScrollLock()
      if (screenshotPreviewUrl) {
        URL.revokeObjectURL(screenshotPreviewUrl)
      }
    }
  })

  $effect(() => {
    if (typeof window === 'undefined' || !isOpen) return
    window.addEventListener('paste', handlePaste)
    window.addEventListener('keydown', handleWindowKeyDown)
    return () => {
      window.removeEventListener('paste', handlePaste)
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  })
</script>

<button
  type="button"
  class="report-bug-trigger tap-target-icon btn-ghost"
  aria-label="Report a bug"
  onclick={openSheet}
>
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="m8 2 1.88 1.88" />
    <path d="M14.12 3.88 16 2" />
    <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
    <path d="M12 20c-4.418 0-8-3.582-8-8V9h16v3c0 4.418-3.582 8-8 8Z" />
    <path d="M5 12H2" />
    <path d="M22 12h-3" />
    <path d="M4 17H2" />
    <path d="M22 17h-2" />
    <path d="m19 6.5-1.5 1.5" />
    <path d="m5 6.5 1.5 1.5" />
  </svg>
</button>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    use:portal
    class="bug-report-backdrop"
    onclick={(e) => e.target === e.currentTarget && closeSheet()}
  >
    <div
      class="bug-report-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-reporter-title"
    >
      <div class="bug-report-handle"></div>
      <div class="bug-report-header">
        <h2 id="bug-reporter-title" class="bug-report-title">Report a Bug</h2>
        <button
          type="button"
          class="bug-report-close-btn"
          onclick={closeSheet}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div class="bug-report-body">
        {#if successState}
          <div class="success-view">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--feedback-success, green)"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              style="margin: 16px auto; display: block;"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <p class="success-message">
              {successMode === 'local'
                ? 'Thank you! Your bug report has been logged locally.'
                : 'Thank you! Your bug report has been submitted.'}
            </p>
            {#if successMode === 'local'}
              <div class="backend-notice">
                <span class="badge">MVP Note</span> Supabase database integration is a pending follow-up task.
              </div>
            {/if}
            <div class="bug-report-actions">
              <button type="button" class="btn-primary" onclick={closeSheet}>
                Done
              </button>
            </div>
          </div>
        {:else}
          <form class="bug-report-form" onsubmit={handleSubmit}>
            {#if errorMsg}
              <div class="error-banner banner critical">
                {errorMsg}
              </div>
            {/if}

            <div class="field">
              <label for="bug-title">Bug Title *</label>
              <input
                type="text"
                id="bug-title"
                bind:value={title}
                placeholder="e.g. App crashes when clicking save"
                required
              />
            </div>

            <div class="field">
              <label for="bug-notes">Notes / Steps to Reproduce</label>
              <textarea
                id="bug-notes"
                bind:value={notes}
                rows="3"
                placeholder="Provide any helpful context..."
              ></textarea>
            </div>

            <div class="field">
              <label for="bug-severity">Severity</label>
              <select id="bug-severity" bind:value={severity}>
                <option value="low">Low - Minor styling or visual issues</option>
                <option value="medium">Medium - Functional bug with workaround</option>
                <option value="high">High - Critical issue blocking usage</option>
              </select>
            </div>

            <div class="field">
              <label for="bug-screenshot">Screenshot (Optional, Max 6MB)</label>
              <div class="screenshot-input-container">
                <input
                  type="file"
                  id="bug-screenshot"
                  accept="image/*"
                  onchange={handleFileChange}
                />
                <span class="paste-hint">Tip: You can also paste an image while this sheet is open.</span>
              </div>

              {#if screenshotPreviewUrl}
                <div class="screenshot-preview">
                  <img src={screenshotPreviewUrl} alt="Screenshot preview" />
                  <button
                    type="button"
                    class="remove-screenshot-btn"
                    onclick={() => {
                      screenshot = null
                      URL.revokeObjectURL(screenshotPreviewUrl)
                      screenshotPreviewUrl = ''
                    }}
                  >
                    Remove Image
                  </button>
                </div>
              {/if}
            </div>

            <div class="bug-report-actions">
              <button
                type="button"
                class="btn-secondary"
                onclick={closeSheet}
              >
                Cancel
              </button>
              <button type="submit" class="btn-primary">
                Submit Report
              </button>
            </div>
          </form>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .bug-report-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-top: max(16px, env(safe-area-inset-top));
    overscroll-behavior: contain;
  }

  .bug-report-sheet {
    width: 100%;
    max-width: 520px;
    max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 16px);
    border: 1px solid var(--border-l, var(--border-strong, var(--border)));
    border-radius: 20px 20px 0 0;
    background: var(--card);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    overscroll-behavior: contain;
  }

  .bug-report-handle {
    width: 36px;
    height: 4px;
    background: var(--border-l, var(--border-strong, var(--border)));
    border-radius: 999px;
    margin: 12px auto;
    flex-shrink: 0;
  }

  .bug-report-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 0 20px 12px;
    flex-shrink: 0;
  }

  .bug-report-title {
    margin: 0;
  }

  .bug-report-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 20px calc(16px + env(safe-area-inset-bottom));
  }

  .bug-report-form {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  .bug-report-close-btn {
    border: none;
    background: transparent;
    font-size: 24px;
    cursor: pointer;
    color: var(--t2, #666);
    padding: 4px 8px;
    border-radius: 4px;
  }
  .bug-report-close-btn:hover {
    background: var(--control-bg-hover, rgba(0,0,0,0.05));
    color: var(--t1, #000);
  }

  .bug-report-actions {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: flex;
    gap: 10px;
    margin-top: auto;
    padding-top: 12px;
    padding-bottom: max(16px, calc(8px + env(safe-area-inset-bottom)));
    background: linear-gradient(to top, var(--card) 82%, transparent);
  }

  .bug-report-actions button {
    flex: 1;
  }

  .success-view {
    text-align: center;
    padding: 8px 0 0;
  }
  .success-message {
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 12px;
  }
  .backend-notice {
    font-size: 13px;
    color: var(--t3, #888);
    margin-bottom: 24px;
  }
  .backend-notice .badge {
    background: var(--border);
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: bold;
    font-size: 11px;
  }
  .screenshot-input-container {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .paste-hint {
    font-size: 12px;
    color: var(--t3, #888);
  }
  .screenshot-preview {
    margin-top: 12px;
    position: relative;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px;
    background: var(--surface-2, #fafafa);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .screenshot-preview img {
    max-width: 100%;
    max-height: 150px;
    object-fit: contain;
    border-radius: 4px;
  }
  .remove-screenshot-btn {
    background: transparent;
    border: 1px solid var(--critical-border, red);
    color: var(--critical, red);
    padding: 4px 12px;
    font-size: 12px;
    font-weight: bold;
    border-radius: 4px;
    cursor: pointer;
  }
  .remove-screenshot-btn:hover {
    background: var(--critical-subtle, rgba(255,0,0,0.05));
  }
  .report-bug-trigger {
    border: none;
    background: transparent;
    cursor: pointer;
    display: grid;
    place-items: center;
    color: var(--t2, inherit);
    border-radius: var(--radius-pill, 9999px);
    transition: background 0.15s, color 0.15s;
  }
  .report-bug-trigger:hover {
    background: var(--control-bg-hover, rgba(0,0,0,0.05));
    color: var(--t1, inherit);
  }

  /* --life-os-desktop; Svelte 组件样式不过 @custom-media 展开,须写字面量 */
  @media (min-width: 840px) {
    .bug-report-backdrop {
      align-items: center;
      padding: 20px;
    }

    .bug-report-sheet {
      border-radius: 16px;
      max-height: 85dvh;
    }

    .bug-report-handle {
      display: none;
    }
  }
</style>
