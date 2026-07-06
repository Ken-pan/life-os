export const LIFE_OS_AUTH_STORAGE_KEY: string;
export const SYNC_DEFAULTS: { cooldownMs: number; debounceMs: number };
export const AUTH_SYNC_EVENTS: readonly string[];
export const LIFE_OS_APP_IDS: readonly ['finance', 'fitness', 'planner'];

export function syncMetaStorageKey(appId: 'finance' | 'fitness' | 'planner'): string;
export function readSyncMeta(appId: 'finance' | 'fitness' | 'planner'): {
  userId?: string;
  lastSyncAt?: string;
} | null;
export function writeSyncMeta(appId: 'finance' | 'fitness' | 'planner', userId: string): void;

export function createBidirectionalSync(options: {
  performSync: () => Promise<Record<string, unknown>>;
  onError?: (err: unknown) => void | Promise<void>;
  onSilentPull?: (result: Record<string, unknown>) => void | Promise<void>;
}): {
  syncBidirectional: (options?: { silent?: boolean; force?: boolean }) => Promise<Record<string, unknown>>;
  scheduleBidirectionalSync: (options?: { immediate?: boolean; silent?: boolean }) => Promise<Record<string, unknown>>;
  resetCooldown: () => void;
};

export function createDebouncedTask<T extends (...args: never[]) => Promise<unknown>>(
  run: T,
  debounceMs?: number
): {
  execute: (...args: Parameters<T>) => ReturnType<T>;
  schedule: (options?: { immediate?: boolean } & Record<string, unknown>) => Promise<unknown>;
  cancelDebounce: () => void;
};

export function bindVisibilitySync(
  callback: () => void,
  options?: { when?: () => boolean }
): () => void;

export function createAuthSyncHandler(handlers: {
  onSignedOut?: () => void;
  onSyncSession?: (ctx: { event: string; silent: boolean; force: boolean }) => void | Promise<void>;
}): (event: string, session: { user?: { id?: string } } | null) => void;

export function formatSyncErrorMessage(
  err: unknown,
  labels: { network: string; rateLimit: string; fallback: string; schemaCache?: string }
): string;

export function createSyncNotify(options: {
  formatError: (err: unknown) => string;
}): {
  subscribeSyncError: (listener: (message: string) => void) => () => void;
  syncErrorMessage: (err: unknown) => string;
  notifySyncError: (err: unknown) => void;
  withSyncNotify: <T>(fn: () => Promise<T>) => Promise<T>;
};

export function mapAuthErrorMessage(
  err: unknown,
  labels: {
    invalidCredentials: string;
    emailNotConfirmed: string;
    alreadyRegistered: string;
    passwordShort: string;
    invalidEmail: string;
    rateLimit: string;
    network: string;
    generic: string;
  }
): string;

export function notifyManualSyncResult(
  result: { pulled?: boolean; pushed?: boolean; switchedAccount?: boolean },
  options: {
    toast: (msg: string, tone?: string, options?: { key?: string }) => void;
    labels: {
      merged: string;
      uploaded: string;
      downloaded: string;
      accountLoaded: string;
      accountSwitched: string;
    };
    onBeforeNotify?: () => void | Promise<void>;
  }
): Promise<void>;
