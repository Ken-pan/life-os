/**
 * 换账号时的本地 hydration 策略（纯函数，便于单测）。
 * 绝不 merge 上一账号的 localStorage 数据进新账号。
 *
 * @param {{ cached: object|null, cloud: object|null, cloudHasData: boolean }} input
 * @returns {{ source: 'cache'|'cloud'|'empty', pulled: boolean }}
 */
export function planAccountSwitchHydration({ cached, cloud, cloudHasData }) {
  if (cached) return { source: 'cache', pulled: false };
  if (cloud && cloudHasData) return { source: 'cloud', pulled: true };
  return { source: 'empty', pulled: false };
}
