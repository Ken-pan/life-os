<script>
  import { afterNavigate } from '$app/navigation';
  import { goto } from '$app/navigation';
  import AppBar from '$lib/components/AppBar.svelte';
  import { auth, signIn, signUp, signOut, authErrorMessage } from '$lib/auth.svelte.js';
  import { isSupabaseConfigured } from '$lib/supabase.js';
  import { syncBidirectional } from '$lib/sync.js';
  import { toast } from '$lib/ui.svelte.js';
  import { t } from '$lib/i18n/index.js';

  let mode = $state('signin');
  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');
  let confirmSent = $state(false);
  /** @type {HTMLInputElement | null} */
  let emailInput = $state(null);

  afterNavigate(() => {
    if (!auth.user && isSupabaseConfigured && !confirmSent) {
      emailInput?.focus();
    }
  });

  async function syncAfterLogin() {
    try {
      await syncBidirectional({ force: true, silent: true });
    } catch {
      toast(t('sync.failed'), 'error');
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    error = '';
    busy = true;
    try {
      if (mode === 'signup') {
        const { needsConfirm } = await signUp(email.trim(), password);
        if (needsConfirm) confirmSent = true;
        else {
          toast(t('auth.signUpSuccess'));
          await syncAfterLogin();
          goto('/settings');
        }
      } else {
        await signIn(email.trim(), password);
        toast(t('auth.signInSuccess'));
        await syncAfterLogin();
        goto('/settings');
      }
    } catch (err) {
      error = authErrorMessage(err);
    } finally {
      busy = false;
    }
  }
</script>

<AppBar title={t('auth.title')} backHref="/settings" backLabel={t('nav.settings')} />

<div class="wrap auth-wrap">

  {#if auth.user}
    <div class="settings-block">
      <p>{t('auth.signedInAs', { email: auth.user.email })}</p>
      <button type="button" class="btn-secondary" onclick={async () => { await signOut(); toast(t('auth.signedOut')); }}>{t('auth.signOut')}</button>
    </div>
  {:else if !isSupabaseConfigured}
    <div class="settings-block">
      <p>{t('settings.syncUnavailable')}</p>
    </div>
  {:else if confirmSent}
    <div class="settings-block">
      <p>{t('auth.confirmSent')}</p>
    </div>
  {:else}
    <form class="settings-block auth-form" onsubmit={submit}>
      <div class="seg" style="margin-bottom:16px">
        <button type="button" class:on={mode === 'signin'} onclick={() => (mode = 'signin')}>{t('auth.signIn')}</button>
        <button type="button" class:on={mode === 'signup'} onclick={() => (mode = 'signup')}>{t('auth.signUp')}</button>
      </div>
      <div class="field">
        <label for="email">{t('auth.email')}</label>
        <input
          id="email"
          bind:this={emailInput}
          type="email"
          bind:value={email}
          required
          autocomplete="email"
          inputmode="email"
          enterkeyhint="next"
          placeholder={t('auth.emailPlaceholder')}
        />
      </div>
      <div class="field">
        <label for="password">{t('auth.password')}</label>
        <input id="password" type="password" bind:value={password} required minlength="6" autocomplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder={t('auth.passwordPlaceholder')} />
      </div>
      {#if error}<p class="auth-error">{error}</p>{/if}
      <button type="submit" class="btn-primary" disabled={busy}>{mode === 'signup' ? t('auth.signUp') : t('auth.signIn')}</button>
    </form>
  {/if}
</div>

<style>
  .auth-form { display: flex; flex-direction: column; gap: 4px; }
  .auth-error { color: var(--deadline); font-size: var(--text-sm); }
</style>
