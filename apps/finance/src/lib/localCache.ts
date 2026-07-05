// 本地缓存层：把「上次成功从云端加载的数据」快照进 localStorage，
// 实现「先用缓存秒开页面、再后台静默刷新」(stale-while-revalidate) 的丝滑体验。
//
// 设计要点：
// - 缓存只是 UI 加速手段，真实数据与权限仍以 Supabase + RLS 为准；
//   即使缓存被篡改，也只影响本机这一次渲染，刷新时会被云端真值覆盖。
// - 缓存按 userId 隔离，避免多账户串数据。
// - 带 schemaVersion，结构升级时旧缓存自动失效。

import { LIFE_OS_AUTH_STORAGE_KEY } from "@life-os/sync";

const PREFIX = "fos_cache";
const SCHEMA_VERSION = 1;

/** Supabase 会话在 localStorage 中的键（与 supabase.ts 的 storageKey 一致）。 */
const AUTH_STORAGE_KEY = LIFE_OS_AUTH_STORAGE_KEY;

interface Envelope<T> {
  v: number;
  userId: string;
  cachedAt: string;
  data: T;
}

function cacheKey(scope: string, userId: string): string {
  return `${PREFIX}:${scope}:${userId}`;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** 读取某个作用域下当前用户的缓存数据；无缓存 / 结构过期 / 解析失败时返回 null。 */
export function readCache<T>(scope: string, userId: string): T | null {
  const ls = safeLocalStorage();
  if (!ls || !userId) return null;
  try {
    const raw = ls.getItem(cacheKey(scope, userId));
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (env.v !== SCHEMA_VERSION || env.userId !== userId) return null;
    return env.data;
  } catch {
    return null;
  }
}

/** 写入某个作用域下当前用户的缓存数据；失败仅静默忽略（缓存非关键路径）。 */
export function writeCache<T>(scope: string, userId: string, data: T): void {
  const ls = safeLocalStorage();
  if (!ls || !userId) return;
  try {
    const env: Envelope<T> = {
      v: SCHEMA_VERSION,
      userId,
      cachedAt: new Date().toISOString(),
      data,
    };
    ls.setItem(cacheKey(scope, userId), JSON.stringify(env));
  } catch {
    // 配额超限 / 隐私模式：忽略，退化为纯网络加载。
  }
}

/** 清空全部本地业务缓存（退出登录 / 切换账户时调用）。 */
export function clearAllCache(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith(`${PREFIX}:`)) toRemove.push(k);
    }
    for (const k of toRemove) ls.removeItem(k);
  } catch {
    // 忽略。
  }
}

/**
 * 同步读取当前持久化会话里的 userId（不触发网络）。
 * 用于在 React 首帧之前就决定「能否直接用缓存渲染」，避免任何 loading 闪屏。
 */
export function peekSessionUserId(): string | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // supabase-js v2 直接把 Session 对象序列化在该键下。
    const session = (parsed.currentSession ?? parsed) as
      | { user?: { id?: unknown }; expires_at?: unknown }
      | undefined;
    const id = session?.user?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export const CACHE_SCOPES = {
  finance: "finance",
  txns: "txns",
  occurrences: "occ",
  assertions: "assert",
} as const;
