<script>
  import { goto } from '$app/navigation';
  import { auth, signIn, signUp, authErrorMessage } from '$lib/auth.svelte.js';
  import { syncBidirectional } from '$lib/sync.js';
  import { toast } from '$lib/ui.svelte.js';
  import { reveal } from '$lib/actions/reveal.js';
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
        if (needsConfirm) {
          confirmSent = true;
        } else {
          toast(t('auth.signUpSuccess'));
          try {
            await syncBidirectional({ force: true, silent: true });
          } catch {
            toast(t('auth.syncFailed'));
          }
          goto('/settings');
        }
      } else {
        await signIn(email.trim(), password);
        toast(t('auth.signInSuccess'));
        try {
          await syncBidirectional({ force: true, silent: true });
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

  function switchMode(next) {
    mode = next;
    error = '';
    confirmSent = false;
  }
</script>

<section class="view">
  <div class="wrap">

    {#if auth.user}
      <div class="set-group" use:reveal>
        <div class="sg-title">{t('auth.signedIn')}</div>
        <div class="set-row" style="display:block">
          <div class="sr-label" style="margin-bottom:6px">{auth.user.email}</div>
          <div class="sr-desc" style="margin-bottom:12px">{t('auth.signedInDesc')}</div>
          <a class="btn-secondary auth-btn-link" href="/settings">{t('auth.goSettings')}</a>
        </div>
      </div>
    {:else if confirmSent}
      <div class="set-group" use:reveal>
        <div class="sg-title">{t('auth.confirmSent')}</div>
        <div class="set-row" style="display:block">
          <div class="sr-label" style="margin-bottom:6px">{t('auth.checkInbox', { email })}</div>
          <div class="sr-desc" style="margin-bottom:12px">
            {t('auth.confirmHint')}
          </div>
          <button class="btn-secondary" onclick={() => switchMode('signin')}>{t('auth.backSignIn')}</button>
        </div>
      </div>
    {:else}
      <div class="set-group" use:reveal>
        <div class="sg-title">{mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}</div>
        <form class="auth-form" onsubmit={submit}>
          <label class="auth-field">
            <span>{t('auth.email')}</span>
            <input
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              required
              bind:value={email}
            />
          </label>
          <label class="auth-field">
            <span>{t('auth.password')}</span>
            <input
              type="password"
              autocomplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder={t('auth.passwordHint')}
              minlength="6"
              required
              bind:value={password}
            />
          </label>

          {#if error}
            <p class="auth-error" role="alert">{error}</p>
          {/if}

          <button class="btn-primary auth-submit" type="submit" disabled={busy}>
            {busy ? t('auth.pleaseWait') : mode === 'signin' ? t('auth.signIn') : t('auth.createAccount')}
          </button>

          {#if mode === 'signin'}
            <p class="auth-switch">
              {t('auth.noAccount')}
              <button type="button" onclick={() => switchMode('signup')}>{t('auth.signUp')}</button>
            </p>
          {:else}
            <p class="auth-switch">
              {t('auth.hasAccount')}
              <button type="button" onclick={() => switchMode('signin')}>{t('auth.signIn')}</button>
            </p>
          {/if}
        </form>
      </div>

      <div class="set-note">
        {t('auth.footnote')}
      </div>
    {/if}
  </div>
</section>

<style>
  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px 18px 18px;
  }
  .auth-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .auth-field span {
    font-family: var(--mono);
    font-size: var(--text-xs);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--t3);
  }
  .auth-field input {
    width: 100%;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid var(--border-l);
    background: var(--bg-2);
    color: var(--t1);
    font-size: var(--text-base);
    outline: none;
    transition: border-color var(--dur-fast) var(--ease-standard),
      box-shadow var(--dur-fast) var(--ease-standard);
  }
  .auth-field input:focus-visible {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 13%, transparent);
  }
  .auth-error {
    font-size: var(--text-sm);
    color: var(--accent);
  }
  .auth-submit {
    width: 100%;
  }
  .auth-switch {
    font-size: var(--text-sm);
    color: var(--t3);
    text-align: center;
  }
  .auth-switch button {
    color: var(--accent);
    font-weight: 600;
  }
</style>
