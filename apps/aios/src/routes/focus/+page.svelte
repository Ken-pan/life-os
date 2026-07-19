<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import FocusSessionShell from '$lib/components/FocusSessionShell.svelte'
  import { FOCUS, hydrateFocusStore } from '$lib/kenos/focusStore.svelte.js'

  onMount(() => {
    hydrateFocusStore()
    if (!FOCUS.focus) {
      void goto('/spaces')
    }
  })
</script>

{#if FOCUS.focus}
  <FocusSessionShell />
{:else}
  <div class="empty">
    <p>当前没有 Focus Session。</p>
    <a href="/spaces">前往 Spaces</a>
  </div>
{/if}

<style>
  .empty {
    width: min(100% - 32px, 640px);
    margin: 48px auto;
  }
</style>
