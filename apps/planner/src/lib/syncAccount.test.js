import { describe, expect, it } from 'vitest';
import { planAccountSwitchHydration } from './syncAccount.js';

describe('planAccountSwitchHydration', () => {
  it('prefers per-user cache over cloud', () => {
    expect(
      planAccountSwitchHydration({
        cached: { tasks: [{ id: '1' }] },
        cloud: { tasks: [{ id: '2' }] },
        cloudHasData: true
      })
    ).toEqual({ source: 'cache', pulled: false });
  });

  it('falls back to cloud replace when no cache', () => {
    expect(
      planAccountSwitchHydration({
        cached: null,
        cloud: { tasks: [{ id: '2' }] },
        cloudHasData: true
      })
    ).toEqual({ source: 'cloud', pulled: true });
  });

  it('uses empty default when neither cache nor cloud has data', () => {
    expect(
      planAccountSwitchHydration({
        cached: null,
        cloud: { tasks: [] },
        cloudHasData: false
      })
    ).toEqual({ source: 'empty', pulled: false });
  });
});
