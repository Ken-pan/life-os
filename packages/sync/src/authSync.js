import { AUTH_SYNC_EVENTS } from './constants.js';

/**
 * Supabase onAuthStateChange 统一同步钩子
 * @param {{
 *   onSignedOut?: () => void;
 *   onSyncSession?: (ctx: { event: string; silent: boolean; force: boolean }) => void | Promise<void>;
 * }} handlers
 */
export function createAuthSyncHandler(handlers) {
  return (event, session) => {
    if (!session?.user) {
      if (event === 'SIGNED_OUT' && handlers.onSignedOut) handlers.onSignedOut();
      return;
    }

    if (!AUTH_SYNC_EVENTS.includes(event) || !handlers.onSyncSession) return;

    const silent = event === 'INITIAL_SESSION';
    const force = event === 'SIGNED_IN';
    queueMicrotask(() => {
      handlers.onSyncSession({ event, silent, force }).catch(() => {});
    });
  };
}
