/**
 * App 回到前台时触发同步（三端统一）
 * @param {() => void} callback
 * @param {{ when?: () => boolean }} [options]
 */
export function bindVisibilitySync(callback, options = {}) {
  const { when = () => true } = options;
  if (typeof document === 'undefined') return () => {};

  const onVisible = () => {
    if (document.visibilityState === 'visible' && when()) callback();
  };

  document.addEventListener('visibilitychange', onVisible);
  return () => document.removeEventListener('visibilitychange', onVisible);
}
