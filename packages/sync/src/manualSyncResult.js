/**
 * 用户主动触发的双向同步结果 Toast（背景同步不调用）。
 *
 * @param {{ pulled?: boolean, pushed?: boolean, switchedAccount?: boolean }} result
 * @param {{
 *   toast: (msg: string, tone?: string, options?: { key?: string }) => void,
 *   labels: {
 *     merged: string,
 *     uploaded: string,
 *     downloaded: string,
 *     accountLoaded: string,
 *     accountSwitched: string,
 *   },
 *   onBeforeNotify?: () => void | Promise<void>,
 * }} options
 */
export async function notifyManualSyncResult(result, { toast, labels, onBeforeNotify }) {
  await onBeforeNotify?.();
  const { pulled, pushed, switchedAccount } = result;
  if (switchedAccount) {
    if (pulled) toast(labels.accountLoaded, 'success', { key: 'sync-account-loaded' });
    else toast(labels.accountSwitched, 'success', { key: 'sync-account-switched' });
    return;
  }
  if (pushed && pulled) toast(labels.merged, 'success', { key: 'sync-merged' });
  else if (pushed) toast(labels.uploaded, 'success', { key: 'sync-uploaded' });
  else if (pulled) toast(labels.downloaded, 'success', { key: 'sync-downloaded' });
}
