import { supabase } from "./supabase";
import { SB } from "./supabaseTables";

/** 逻辑设备槽：一台物理电脑 = desktop，一部手机 = mobile。同一槽位下所有浏览器共享。 */
export type DeviceClass = "desktop" | "mobile";

/** 设备数量硬上限：只允许 1 台电脑 + 1 部手机。 */
export const MAX_DEVICES = 2;

/** 本机持久化设备 ID 在 localStorage 中的键。一旦生成长期不变，用于「真正识别这台设备」。 */
const DEVICE_ID_KEY = "finance_os_device_id";

export interface DeviceRow {
  id: string;
  device_class: DeviceClass;
  label: string;
  user_agent: string | null;
  device_id: string | null;
  created_at: string;
  last_seen_at: string | null;
}

/**
 * 取得（或首次生成并持久化）本机设备 ID。
 * 与浏览器无关：同一设备无论 UA 怎么变都返回同一个稳定 ID。
 * localStorage 不可用时回退到一个临时 ID（不持久，但当次会话内可用）。
 */
export function getOrCreateDeviceId(): string {
  try {
    const ls = window.localStorage;
    let id = ls.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = newId();
      ls.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `ephemeral_${newId()}`;
  }
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getDeviceClass(): DeviceClass {
  const ua = navigator.userAgent;
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  return isMobile ? "mobile" : "desktop";
}

export function deviceClassLabel(cls: DeviceClass): string {
  return cls === "mobile" ? "手机" : "电脑";
}

/** 当前浏览器名（设置页副标题用）。 */
export function describeThisBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/CriOS\//.test(ua)) return "Chrome";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "浏览器";
}

/** 当前操作系统 / 机型（用于更可读的设备标签，如「Mac · Chrome」）。 */
export function describeThisPlatform(): string {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS X|Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return getDeviceClass() === "mobile" ? "手机" : "电脑";
}

/** 组合出一个人类可读的设备标签，例如「Mac · Chrome」「iPhone · Safari」。 */
export function buildDeviceLabel(): string {
  return `${describeThisPlatform()} · ${describeThisBrowser()}`;
}

export async function listDevices(): Promise<DeviceRow[]> {
  const { data, error } = await supabase
    .from(SB.core.allowedDevices)
    .select("id,device_class,label,user_agent,device_id,created_at,last_seen_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as DeviceRow[];
}

export interface DeviceCheckResult {
  status: "authorized" | "limit-reached";
  device?: DeviceRow;
}

/**
 * 登录成功后调用：按「电脑 / 手机」逻辑槽授权，并用持久化 device_id 真正识别本机。
 * - 先按 device_id 精确匹配本机槽位（最可靠，UA 变化也认得出）。
 * - 否则退回按设备类型（desktop / mobile）匹配同类槽位，并把本机 device_id 绑定上去。
 * - 尚无该类型槽位且总槽位 < 2 → 注册新槽位。
 * - 电脑 + 手机都已占用 → 拒绝第三台物理设备。
 */
export async function ensureDeviceAuthorized(): Promise<DeviceCheckResult> {
  const deviceClass = getDeviceClass();
  const deviceId = getOrCreateDeviceId();
  const label = buildDeviceLabel();
  const devices = await listDevices();

  // 优先用持久化 device_id 精确认出本机；否则退回同类型槽位。
  const slot =
    devices.find((d) => d.device_id && d.device_id === deviceId) ??
    devices.find((d) => d.device_class === deviceClass);

  if (slot) {
    const { data, error } = await supabase
      .from(SB.core.allowedDevices)
      .update({
        last_seen_at: new Date().toISOString(),
        user_agent: navigator.userAgent,
        device_id: deviceId,
        label,
      })
      .eq("id", slot.id)
      .select("id,device_class,label,user_agent,device_id,created_at,last_seen_at")
      .single();
    if (error) throw error;
    return { status: "authorized", device: data as DeviceRow };
  }

  if (devices.length >= MAX_DEVICES) {
    return { status: "limit-reached" };
  }

  const { data: userData } = await supabase.auth.getUser();
  const row = {
    id: newId(),
    user_id: userData.user?.id,
    device_class: deviceClass,
    label,
    user_agent: navigator.userAgent,
    device_id: deviceId,
    last_seen_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from(SB.core.allowedDevices)
    .insert(row)
    .select("id,device_class,label,user_agent,device_id,created_at,last_seen_at")
    .single();
  if (error) {
    // unique (user_id, device_class) 冲突时，说明同类型槽位已存在，重试读取。
    if (error.code === "23505") {
      const retry =
        devices.find((d) => d.device_id === deviceId) ??
        devices.find((d) => d.device_class === deviceClass);
      if (retry) return { status: "authorized", device: retry };
    }
    return { status: "limit-reached" };
  }
  return { status: "authorized", device: data as DeviceRow };
}

export async function removeDevice(id: string): Promise<void> {
  const { error } = await supabase.from(SB.core.allowedDevices).delete().eq("id", id);
  if (error) throw error;
}

/** 判断某条设备记录是否就是「本机」：优先用持久化 device_id，回退到设备类型。 */
export function isThisDeviceSlot(row: DeviceRow): boolean {
  const myId = getOrCreateDeviceId();
  if (row.device_id) return row.device_id === myId;
  return row.device_class === getDeviceClass();
}
