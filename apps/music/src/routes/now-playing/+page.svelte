<script>
  import { onMount } from 'svelte'
  import { goto } from '$app/navigation'
  import NowPlayingScreen from '$lib/components/NowPlayingScreen.svelte'
  import { consumeNowPlayingReturn, ensureNowPlayingReturn } from '$lib/nav.js'

  onMount(() => {
    ensureNowPlayingReturn('/')
  })

  function dismiss() {
    goto(consumeNowPlayingReturn('/'))
  }
</script>

<NowPlayingScreen onDismiss={dismiss} />
