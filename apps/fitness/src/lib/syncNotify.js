import { createSyncNotify, formatSyncErrorMessage } from '@life-os/sync';
import { t } from './i18n/index.js';

const syncNotify = createSyncNotify({
  formatError: (err) =>
    formatSyncErrorMessage(err, {
      network: t('auth.errNetwork'),
      rateLimit: t('auth.errRateLimit'),
      fallback: t('sync.defaultError')
    })
});

export const { subscribeSyncError, syncErrorMessage, notifySyncError, clearSyncError, withSyncNotify } =
  syncNotify;
