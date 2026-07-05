/** 云端同步失败时的轻量 pub/sub，供 AppShell 展示 banner。 */

import { t } from "../i18n/translate";

type SyncErrorListener = (message: string) => void;

const listeners = new Set<SyncErrorListener>();

export function subscribeSyncError(listener: SyncErrorListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifySyncError(message: string): void {
  const text = message.trim() || t("sync.defaultError");
  for (const fn of listeners) fn(text);
}
