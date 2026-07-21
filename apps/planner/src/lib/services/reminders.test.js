import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  reminderFireAt,
  syncRemindersToNative,
  __resetNativeLocalCacheForTests,
} from './reminders.js';
import * as nativeBridge from '@life-os/platform-web/kenos-native-bridge';
import { S } from '../state.svelte.js';

const baseTask = {
  id: '1',
  title: 'Test',
  notes: '',
  listId: 'inbox',
  priority: 0,
  dueDate: '2026-07-05',
  dueTime: '09:00',
  reminderMinutes: 15,
  recurrence: null,
  tags: [],
  subtasks: [],
  completed: false,
  completedAt: null,
  createdAt: 1,
  updatedAt: 1,
  sortOrder: 1,
  meta: {}
};

describe('reminderFireAt', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null when reminder already passed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 5, 9, 0, 0));
    expect(reminderFireAt(baseTask)).toBeNull();
  });

  it('computes fire time before due', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 5, 8, 0, 0));
    const fireAt = reminderFireAt(baseTask);
    expect(fireAt).toBe(new Date(2026, 6, 5, 8, 45, 0).getTime());
  });

  it('uses 9:00 default when no dueTime', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 5, 8, 0, 0));
    const fireAt = reminderFireAt({ ...baseTask, dueTime: null, reminderMinutes: 0 });
    expect(fireAt).toBe(new Date(2026, 6, 5, 9, 0, 0).getTime());
  });
});

describe('syncRemindersToNative', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    __resetNativeLocalCacheForTests();
  });

  it('skips when native bridge unavailable', async () => {
    vi.spyOn(nativeBridge, 'isNativeBridgeAvailable').mockReturnValue(false);
    const result = await syncRemindersToNative([{ id: 'a', title: 'A', fireAt: Date.now() + 60_000 }]);
    expect(result.skipped).toBe(true);
  });

  it('syncs jobs when localNotifications capability is present', async () => {
    vi.spyOn(nativeBridge, 'isNativeBridgeAvailable').mockReturnValue(true);
    vi.spyOn(nativeBridge, 'getNativeCapabilities').mockResolvedValue({
      ok: true,
      capabilities: { localNotifications: true, push: false },
    });
    const sync = vi
      .spyOn(nativeBridge, 'nativeNotificationsSyncReminders')
      .mockResolvedValue({ ok: true, scheduled: 1 });
    const prev = S.settings.notificationsEnabled;
    S.settings.notificationsEnabled = true;
    const jobs = [{ id: 'task-1', title: 'Ship', fireAt: Date.now() + 120_000 }];
    const result = await syncRemindersToNative(jobs);
    S.settings.notificationsEnabled = prev;
    expect(result.ok).toBe(true);
    expect(sync).toHaveBeenCalledWith({ jobs });
  });

  it('clears plan reminders when notifications disabled', async () => {
    vi.spyOn(nativeBridge, 'isNativeBridgeAvailable').mockReturnValue(true);
    vi.spyOn(nativeBridge, 'getNativeCapabilities').mockResolvedValue({
      ok: true,
      capabilities: { localNotifications: true },
    });
    const cancel = vi
      .spyOn(nativeBridge, 'nativeNotificationsCancel')
      .mockResolvedValue({ ok: true });
    const prev = S.settings.notificationsEnabled;
    S.settings.notificationsEnabled = false;
    const result = await syncRemindersToNative([{ id: 'a', title: 'A', fireAt: Date.now() + 60_000 }]);
    S.settings.notificationsEnabled = prev;
    expect(result.cleared).toBe(true);
    expect(cancel).toHaveBeenCalledWith({ type: 'plan_reminder' });
  });
});
