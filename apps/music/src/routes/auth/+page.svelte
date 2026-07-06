<script>
  import { goto } from '$app/navigation';
  import { auth, signIn, signUp, signOut, authErrorMessage } from '$lib/auth.svelte.js';
  import { syncBidirectionalSafe } from '$lib/sync.js';
  import { toast } from '$lib/ui.svelte.js';
  import { t } from '$lib/i18n/index.js';

  let mode = $state('signin');
  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');
  let confirmSent = $state(false);

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
          try {
            await syncBidirectionalSafe({ force: true, silent: true });
          } catch {
            toast(t('auth.syncFailed'));
          }
          goto('/settings');
        }
      } else {
        await signIn(email.trim(), password);
        toast(t('auth.signInSuccess'));
        try {
          await syncBidirectionalSafe({ force: true, silent: true });
        } catch {
          toast(t('auth.syncFailed'));
        }
        goto('/settings');
      }
    } catch (err) {
      error = authErrorMessage(err);
    } finally {
      busy = false;
    }
  }

  async function onSignOut() {
    await signOut();
    toast(t('settings.signOut'));
  }
</script>

<div class="wrap">
  {#if auth.user}
    <section class="settings-block set-group">
      <h3 class="block-title sg-title">{t('auth.signedIn')}</h3>
      <div class="set-row settings-row" style="display:block">
        <div class="pref-label">{auth.user.email}</div>
        <p class="pref-desc">{t('auth.signedInDesc')}</p>
        <div class="settings-btn-group" style="margin-top:12px">
          <a class="btn-secondary" href="/settings">{t('auth.goSettings')}</a>
          <button class="btn-danger" type="button" onclick={onSignOut}>{t('settings.signOut')}</button>
        </div>
      </div>
    </section>
  {:else if confirmSent}
    <section class="settings-block set-group">
      <h3 class="block-title sg-title">{t('auth.confirmSent')}</h3>
      <div class="set-row settings-row" style="display:block">
        <p class="pref-label">{t('auth.checkInbox', { email })}</p>
        <p class="pref-desc">{t('auth.confirmHint')}</p>
      </div>
    </section>
  {:else}
    <section class="settings-block set-group">
      <h3 class="block-title sg-title">{mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}</h3>
      <form class="auth-form" onsubmit={submit}>
        <label class="field">
          <span class="sr-label">{t('auth.email')}</span>
          <input type="email" autocomplete="email" required bind:value={email} />
        </label>
        <label class="field">
          <span class="sr-label">{t('auth.password')}</span>
          <input type="password" autocomplete={mode === 'signin' ? 'current-password' : 'new-password'} minlength="6" required bind:value={password} />
        </label>
        {#if error}<p class="auth-error" role="alert">{error}</p>{/if}
        <button class="btn-primary" type="submit" disabled={busy}>{busy ? t('auth.pleaseWait') : mode === 'signin' ? t('auth.signIn') : t('auth.createAccount')}</button>
        <p class="auth-switch">
          {#if mode === 'signin'}
            {t('auth.noAccount')} <button type="button" onclick={() => (mode = 'signup')}>{t('auth.signUp')}</button>
          {:else}
            {t('auth.hasAccount')} <button type="button" onclick={() => (mode = 'signin')}>{t('auth.signIn')}</button>
          {/if}
        </p>
      </form>
    </section>
    <p class="set-note">{t('auth.footnote')}</p>
  {/if}
</div>

<style>
  .auth-form { display: flex; flex-direction: column; gap: 14px; padding: 14px 18px 18px; }
  .auth-error { color: var(--accent); font-size: var(--text-sm); }
  .auth-switch { text-align: center; font-size: var(--text-sm); color: var(--t3); }
  .auth-switch button {
    color: var(--accent);
    font-weight: 600;
    min-height: var(--tap-min);
    padding-inline: var(--space-1);
    touch-action: manipulation;
  }
</style>
