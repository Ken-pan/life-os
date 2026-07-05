import {
  AUTH_SYNC_EVENTS,
  createBidirectionalSync,
  writeSyncMeta,
} from "@life-os/sync";

const APP_ID = "finance";

export { AUTH_SYNC_EVENTS };

export function recordFinanceSync(userId: string): void {
  writeSyncMeta(APP_ID, userId);
}

/** Finance 云端刷新（带 cooldown / 单飞，与 Fitness/Planner 一致） */
export function createFinanceCloudSync(refresh: () => Promise<string | null>) {
  return createBidirectionalSync({
    performSync: async () => {
      const userId = await refresh();
      if (userId) recordFinanceSync(userId);
      return { pulled: true, userId: userId ?? undefined };
    },
  });
}
