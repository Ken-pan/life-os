/** 云端同步失败时的轻量 pub/sub，供 AppShell 展示 banner。 */

import { createSyncNotify, formatSyncErrorMessage } from "@life-os/sync";
import { t } from "../i18n/translate";

const syncNotify = createSyncNotify({
  formatError: (err) =>
    formatSyncErrorMessage(err, {
      network: t("sync.errNetwork"),
      rateLimit: t("sync.errRateLimit"),
      fallback: t("sync.defaultError"),
    }),
});

export const { subscribeSyncError, syncErrorMessage, notifySyncError, withSyncNotify } =
  syncNotify;
