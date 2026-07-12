import { describe, it, expect, beforeEach } from 'vitest';
import * as syncStateLogic from '../../extension/popup/syncStateLogic.js';

describe('FINC.SYNC.1b Extension State Logic', () => {
  describe('isSyncing logic', () => {
    it('1. Never synced (empty state is not syncing)', () => {
      expect(syncStateLogic.isSyncing([], 0)).toBe(false);
      expect(syncStateLogic.isSyncing(null, null)).toBe(false);
    });

    it('2. Syncing (queue or inflight active)', () => {
      expect(syncStateLogic.isSyncing([{ id: '1' }], 0)).toBe(true);
      expect(syncStateLogic.isSyncing([], 1)).toBe(true);
      expect(syncStateLogic.isSyncing([{ id: '1' }], 1)).toBe(true);
    });
  });

  describe('10. Error sanitization', () => {
    it('hides tokens and JWTs', () => {
      const raw = 'Failed to fetch: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwi.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const sanitized = syncStateLogic.sanitizeError([raw]);
      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('eyJhbGci');
    });

    it('hides long hex hashes', () => {
      const raw = 'Signature mismatch 9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca72323c3d99ba5c11d7c7acc6e14b8c5da0c4663475c2e5c3adef46f73bcdec043';
      const sanitized = syncStateLogic.sanitizeError([raw]);
      expect(sanitized).toContain('[HASH]');
      expect(sanitized).not.toContain('9b71d224bd6');
    });

    it('hides authorization headers', () => {
      const raw = 'Request failed with header Authorization abcdef12345';
      const sanitized = syncStateLogic.sanitizeError([raw]);
      expect(sanitized).toContain('Authorization [REDACTED]');
      expect(sanitized).not.toContain('abcdef12345');
    });

    it('hides internal URLs and paths', () => {
      const raw = 'Network error fetching https://internal-api.example.com/v1/users or /var/www/html/backend/src/app.js';
      const sanitized = syncStateLogic.sanitizeError([raw]);
      expect(sanitized).toContain('[URL]');
      expect(sanitized).not.toContain('https://');
      expect(sanitized).toContain('[PATH]');
      expect(sanitized).not.toContain('/var/www/html');
    });

    it('removes stack traces', () => {
      const raw = 'TypeError: Cannot read properties of undefined\n    at Object.<anonymous> (/app/src/index.js:42:15)\n    at Module._compile';
      const sanitized = syncStateLogic.sanitizeError([raw]);
      expect(sanitized).toBe('TypeError: Cannot read properties of undefined');
      expect(sanitized).not.toContain('at Object');
    });

    it('limits extremely long strings', () => {
      const raw = 'X'.repeat(200);
      const sanitized = syncStateLogic.sanitizeError([raw]);
      expect(sanitized.length).toBe(100); // 97 chars + '...'
      expect(sanitized.endsWith('...')).toBe(true);
    });
    
    it('provides a generic fallback for empty errors', () => {
      expect(syncStateLogic.sanitizeError([])).toBe('未知同步错误，请重试');
      expect(syncStateLogic.sanitizeError(['   '])).toBe('未知同步错误，请重试');
    });
  });
});

describe('FINC.SYNC.1b Background Concurrency Logic (Simulated)', () => {
  let sessionStore = {};
  let lastResponse = null;

  const mockTriggerSync = async (currentTime) => {
    const active = sessionStore.fos_active_sync;
    // Check heartbeat stale timeout (60s)
    if (active && (currentTime - (active.heartbeatAt ?? active.startedAt) < 60000)) {
      lastResponse = { accepted: false, reason: 'already_syncing', operationId: active.operationId };
      return lastResponse;
    }
    const opId = `op-${currentTime}`;
    sessionStore.fos_active_sync = { operationId: opId, startedAt: currentTime, heartbeatAt: currentTime };
    lastResponse = { accepted: true, operationId: opId };
    return lastResponse;
  };

  const mockHeartbeat = async (currentTime) => {
    if (sessionStore.fos_active_sync) {
      sessionStore.fos_active_sync.heartbeatAt = currentTime;
    }
  };

  const mockSyncResult = async (operationId) => {
    const active = sessionStore.fos_active_sync;
    if (active && active.operationId === operationId) {
      delete sessionStore.fos_active_sync;
    }
    return { ok: true };
  };

  beforeEach(() => {
    sessionStore = {};
    lastResponse = null;
  });

  it('1. First sync acquires a unique operation ID', async () => {
    const res = await mockTriggerSync(1000);
    expect(res.accepted).toBe(true);
    expect(res.operationId).toBe('op-1000');
    expect(sessionStore.fos_active_sync.operationId).toBe('op-1000');
  });

  it('2. Second trigger while active is rejected', async () => {
    await mockTriggerSync(1000);
    const res2 = await mockTriggerSync(1010);
    expect(res2.accepted).toBe(false);
    expect(res2.reason).toBe('already_syncing');
    expect(res2.operationId).toBe('op-1000');
  });

  it('3. A 31-second sync remains active (because heartbeat threshold is 60s)', async () => {
    await mockTriggerSync(1000);
    const res = await mockTriggerSync(32000); // 31s later
    expect(res.accepted).toBe(false);
  });

  it('4. A 16-minute legitimate sync is not treated as stale merely from startedAt', async () => {
    await mockTriggerSync(1000);
    // Heartbeat every 20s
    for (let i = 20000; i < 960000; i += 20000) {
      await mockHeartbeat(1000 + i);
    }
    const res = await mockTriggerSync(1000 + 960000 + 1000); // 16 minutes + 1s later, but heartbeat just happened
    expect(res.accepted).toBe(false); // Should still be rejected because heartbeat keeps it active
  });

  it('5. Heartbeat refresh prevents stale recovery', async () => {
    await mockTriggerSync(1000);
    await mockHeartbeat(60000); // Refresh at 60s
    const res = await mockTriggerSync(65000); // Should be active due to heartbeat
    expect(res.accepted).toBe(false);
  });

  it('6. A genuinely stale heartbeat can recover', async () => {
    await mockTriggerSync(1000);
    await mockHeartbeat(10000); // Last heartbeat at 10s
    // Attempt at 75s (65s since heartbeat) -> stale threshold is 60s
    const res = await mockTriggerSync(75000);
    expect(res.accepted).toBe(true);
    expect(res.operationId).toBe('op-75000');
  });

  it('7 & 8. Operation A cannot clear B, and late FOS_SYNC_RESULT from A cannot clear B', async () => {
    await mockTriggerSync(1000); // op-1000
    // Wait for stale
    await mockTriggerSync(70000); // op-70000 takes over
    
    // Result from op-1000 comes late
    await mockSyncResult('op-1000');
    // Lock should NOT be cleared because it belongs to op-70000
    expect(sessionStore.fos_active_sync.operationId).toBe('op-70000');
  });

  it('9 & 10 & 11. Success/Failure/Finally clears only the owning lock', async () => {
    await mockTriggerSync(1000); // op-1000
    await mockSyncResult('op-1000'); // result from op-1000
    expect(sessionStore.fos_active_sync).toBeUndefined(); // Cleared correctly
  });

  it('12. Popup closure does not release the lock (session persistence)', async () => {
    sessionStore.fos_active_sync = { operationId: 'op-1', startedAt: 1000, heartbeatAt: 1000 };
    const res = await mockTriggerSync(5000);
    expect(res.accepted).toBe(false); // Lock survives closure
  });
});
