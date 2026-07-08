<script>
  import { supabase } from '$lib/supabase.js'
  import { Icon } from '@lucide/svelte'

  const apps = [
    {
      id: 'finance',
      name: 'Finance OS',
      desc: 'Ledger, Net Worth & Scenarios',
      icon: 'wallet',
      url: 'https://finance.kenos.space',
      gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    },
    {
      id: 'planner',
      name: 'Planner OS',
      desc: 'Tasks, Habits & Time',
      icon: 'check-square',
      url: 'https://planner.kenos.space',
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    },
    {
      id: 'fitness',
      name: 'Fitness OS',
      desc: 'Workouts & Progress',
      icon: 'activity',
      url: 'https://fitness.kenos.space',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    },
    {
      id: 'music',
      name: 'Music OS',
      desc: 'Sheets, Practice & Flow',
      icon: 'music',
      url: 'https://music.kenos.space',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    },
  ]

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.reload()
  }
</script>

<div class="portal-container">
  <header class="portal-header">
    <div class="logo">
      <div class="logo-icon"><Icon name="grid" size={24} color="#fff" /></div>
      <h1>Life OS Portal</h1>
    </div>
    <button
      class="btn-ghost sign-out-btn"
      onclick={handleSignOut}
      aria-label="Sign Out"
    >
      <Icon name="log-out" size={18} />
      <span>Sign Out</span>
    </button>
  </header>

  <div class="dashboard-greeting">
    <h2>Welcome back to your ecosystem.</h2>
    <p>Select an app to seamlessly continue your workflow.</p>
  </div>

  <div class="app-grid">
    {#each apps as app}
      <a
        href={app.url}
        class="app-card"
        target="_blank"
        rel="noopener noreferrer"
      >
        <div class="card-glass-bg"></div>
        <div class="icon-container" style="background: {app.gradient};">
          <Icon name={app.icon} size={28} color="#fff" />
        </div>
        <div class="card-content">
          <h3>{app.name}</h3>
          <p>{app.desc}</p>
        </div>
        <div class="card-arrow">
          <Icon name="arrow-right" size={20} />
        </div>
      </a>
    {/each}
  </div>
</div>

<style>
  .portal-container {
    max-width: var(--content-max);
    margin: 0 auto;
    padding: var(--page-gutter);
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
  }

  .portal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .logo-icon {
    width: 40px;
    height: 40px;
    background: var(--t1, var(--text));
    border-radius: var(--control-radius);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .logo h1 {
    font-size: var(--text-5xl);
    font-weight: 700;
    color: var(--t1, var(--text));
    margin: 0;
  }

  .sign-out-btn {
    border: 1px solid var(--border);
  }

  .dashboard-greeting {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .dashboard-greeting h2 {
    font-size: var(--text-display);
    font-weight: 800;
    color: var(--t1, var(--text));
    margin: 0;
    letter-spacing: -0.02em;
  }

  .dashboard-greeting p {
    font-size: var(--text-2xl);
    color: var(--t2, var(--text-secondary));
    margin: 0;
  }

  .app-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-6);
  }

  .app-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    padding: var(--card-padding);
    border-radius: var(--card-radius);
    text-decoration: none;
    color: inherit;
    border: 1px solid var(--border);
    overflow: hidden;
    transition:
      transform var(--dur-base) var(--ease-emphasized),
      border-color var(--dur-base) var(--ease-emphasized),
      box-shadow var(--dur-base) var(--ease-emphasized);
    background: var(--card);
    box-shadow: var(--shadow-card, 0 1px 2px rgba(31, 28, 24, 0.04));
  }

  /* Glassmorphism subtle overlay */
  .card-glass-bg {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      120deg,
      rgba(255, 255, 255, 0.03) 0%,
      rgba(255, 255, 255, 0) 100%
    );
    opacity: 0;
    transition: opacity var(--dur-base) var(--ease-standard);
  }

  .app-card:hover {
    transform: translateY(var(--hover-lift));
    border-color: var(--t2, var(--text-secondary));
    box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.2);
  }

  .app-card:hover .card-glass-bg {
    opacity: 1;
  }

  .icon-container {
    width: 56px;
    height: 56px;
    border-radius: var(--card-radius);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .card-content h3 {
    font-size: var(--text-3xl);
    font-weight: 600;
    color: var(--t1, var(--text));
    margin: 0 0 var(--space-1) 0;
  }

  .card-content p {
    font-size: var(--text-lg);
    color: var(--t3, var(--text-muted));
    margin: 0;
    line-height: 1.4;
  }

  .card-arrow {
    position: absolute;
    right: var(--card-padding);
    bottom: var(--card-padding);
    color: var(--t3, var(--text-muted));
    transition:
      transform var(--dur-base) var(--ease-standard),
      opacity var(--dur-base) var(--ease-standard),
      color var(--dur-base) var(--ease-standard);
    transform: translateX(calc(var(--space-1) * -1));
    opacity: 0.5;
  }

  .app-card:hover .card-arrow {
    transform: translateX(0);
    opacity: 1;
    color: var(--t1, var(--text));
  }

  /* Mobile responsiveness */
  @media (max-width: 640px) {
    .portal-container {
      padding: var(--space-6);
    }
    .dashboard-greeting h2 {
      font-size: var(--text-display-sm);
    }
    .app-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
