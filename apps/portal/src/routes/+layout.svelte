<script>
  import '../app.css'
  import { onMount } from 'svelte'
  import { supabase } from '$lib/supabase.js'
  import { createCoreIdentityHandler } from '@life-os/sync'
  import { CommandPalette } from '@life-os/platform-web'

  let { children } = $props()

  let identityHandler = createCoreIdentityHandler(supabase, 'portal')
  let isReady = $state(false)
  /** @type {import('@supabase/supabase-js').Session | null} */
  let session = $state(null)
  let cpOpen = $state(false)

  const cpActions = [
    {
      id: '1',
      title: 'Open Finance OS',
      icon: 'wallet',
      onSelect: () => (window.location.href = 'https://finance.kenos.space'),
    },
    {
      id: '2',
      title: 'Open Planner OS',
      icon: 'check-square',
      onSelect: () => (window.location.href = 'https://planner.kenos.space'),
    },
    {
      id: '3',
      title: 'Open Fitness OS',
      icon: 'activity',
      onSelect: () => (window.location.href = 'https://fitness.kenos.space'),
    },
    {
      id: '4',
      title: 'Open Music OS',
      icon: 'music',
      onSelect: () => (window.location.href = 'https://music.kenos.space'),
    },
    {
      id: '5',
      title: 'Sign Out',
      icon: 'log-out',
      onSelect: () =>
        supabase.auth.signOut().then(() => window.location.reload()),
    },
  ]

  onMount(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        session = newSession
        if (session?.user) {
          await identityHandler(event, session)
        }
        isReady = true
      },
    )

    supabase.auth.getSession().then(({ data }) => {
      session = data.session
      if (!session) isReady = true
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  })
</script>

<svelte:head>
  <title>Life OS Portal</title>
</svelte:head>

{#if !isReady}
  <div class="portal-loading">Initializing Life OS...</div>
{:else if !session}
  <div class="portal-unauth">
    <h1 class="portal-unauth-title">Welcome to Life OS</h1>
    <p class="portal-unauth-desc">You are not logged in.</p>
    <a
      href="https://finance.kenos.space"
      class="btn-secondary portal-login-link"
    >
      Go to Finance to Login
    </a>
  </div>
{:else}
  <main class="portal-layout">
    {@render children()}
  </main>
  <CommandPalette
    bind:open={cpOpen}
    actions={cpActions}
    placeholder="Jump to an app or action..."
  />
{/if}

<style>
  .portal-layout {
    min-height: 100vh;
    background-color: var(--bg);
    color: var(--t1, var(--text));
    font-family: var(--font);
  }

  .portal-loading {
    display: flex;
    height: 100vh;
    align-items: center;
    justify-content: center;
    font-size: var(--text-xl);
    color: var(--t2, var(--text-secondary));
    background-color: var(--bg);
    font-family: var(--font);
  }

  .portal-unauth {
    display: flex;
    flex-direction: column;
    height: 100vh;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    background-color: var(--bg);
    font-family: var(--font);
  }

  .portal-unauth-title {
    color: var(--t1, var(--text));
    font-size: var(--text-4xl);
    margin: 0;
  }

  .portal-unauth-desc {
    color: var(--t2, var(--text-secondary));
    margin: 0;
    font-size: var(--text-lg);
  }

  .portal-login-link {
    text-decoration: none;
  }
</style>
