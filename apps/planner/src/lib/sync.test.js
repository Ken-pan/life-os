import { describe, it, expect } from 'vitest';
import { payloadHasData, structuredHasData, stateHasData } from './repo.js';

describe('repo data detection', () => {
  it('payloadHasData detects legacy blob', () => {
    expect(payloadHasData(null)).toBe(false);
    expect(payloadHasData({ payload: { tasks: [{ id: '1' }], lists: [] } })).toBe(true);
    expect(payloadHasData({ payload: { tasks: [], projects: [{ id: 'p1' }], lists: [] } })).toBe(true);
  });

  it('structuredHasData detects task/list rows', () => {
    expect(structuredHasData(null)).toBe(false);
    expect(structuredHasData({ tasks: [], lists: [{ id: 'inbox' }, { id: 'x' }] })).toBe(true);
    expect(structuredHasData({ tasks: [{ id: '1' }], lists: [] })).toBe(true);
    expect(structuredHasData({ tasks: [], projects: [{ id: 'p1' }], lists: [] })).toBe(true);
  });

  it('stateHasData aliases structuredHasData', () => {
    expect(stateHasData({ tasks: [{ id: '1' }], lists: [] })).toBe(true);
    expect(stateHasData({ tasks: [], projects: [{ id: 'p1' }], lists: [] })).toBe(true);
  });
});
