<script>
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import { buildAppPath } from '$lib/appRoute'
  import DecisionStudioView from '$lib/components/DecisionStudioView.svelte'

  /** @typedef {'compare' | 'saved' | 'log'} DecisionSection */

  const section = $derived(/** @type {DecisionSection} */ (page.params.section ?? 'compare'))

  /** @param {DecisionSection} next */
  function onChange(next) {
    goto(buildAppPath({ tab: 'decision', section: next }))
  }
</script>

<DecisionStudioView active={section} {onChange} />
