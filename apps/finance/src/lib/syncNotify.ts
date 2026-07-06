/** 云端同步失败时的轻量 pub/sub，供 AppShell 展示 banner。 */

import { formatSyncErrorMessage } from "@life-os/sync";
import { t } from "../i18n/translate";

type SyncErrorListener = (message: string) => void;

const listeners = new Set<SyncErrorListener>();

export function subscribeSyncError(listener: SyncErrorListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function syncErrorMessage(err: unknown): string {
  return formatSyncErrorMessage(err, {
    network: t("sync.errNetwork"),
    rateLimit: t("sync.errRateLimit"),
    fallback: t("sync.defaultError"),
  });
}

export function notifySyncError(err: unknown): void {
  const text = syncErrorMessage(err);
  for (const fn of listeners) fn(text);
}
