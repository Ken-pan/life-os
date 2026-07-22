import {
  MAX_TRUSTED_DEVICES,
  WEB_DEVICE_ID_STORAGE_KEY,
  buildTrustedDeviceLabel,
  describeBrowser,
  describePlatform,
  deviceClassLabel as sharedDeviceClassLabel,
  ensureTrustedDeviceAuthorized,
  getOrCreateTrustedDeviceId,
  isThisTrustedDeviceSlot,
  listTrustedDevices,
  removeTrustedDevice,
  revokeTrustedDevice,
  resolveDeviceClass,
} from "@life-os/sync";
import { supabase } from "./supabase";

export type DeviceClass = "desktop" | "mobile";

export const MAX_DEVICES = MAX_TRUSTED_DEVICES;

export interface DeviceRow {
  id: string;
  device_class: DeviceClass;
  label: string;
  user_agent: string | null;
  device_id: string | null;
  created_at: string;
  last_seen_at: string | null;
  public_key?: string | null;
  platform?: string | null;
  paired_at?: string | null;
  revoked_at?: string | null;
  last_challenge_at?: string | null;
}

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined" || !window.localStorage) {
    return getOrCreateTrustedDeviceId({
      getItem: () => null,
      setItem: () => {},
    });
  }
  return getOrCreateTrustedDeviceId(window.localStorage, WEB_DEVICE_ID_STORAGE_KEY);
}

export function getDeviceClass(): DeviceClass {
  return resolveDeviceClass(typeof navigator !== "undefined" ? navigator.userAgent : "");
}

export function deviceClassLabel(cls: DeviceClass): string {
  return sharedDeviceClassLabel(cls);
}

export function describeThisBrowser(): string {
  return describeBrowser(typeof navigator !== "undefined" ? navigator.userAgent : "");
}

export function describeThisPlatform(): string {
  return describePlatform(typeof navigator !== "undefined" ? navigator.userAgent : "");
}

export function buildDeviceLabel(): string {
  return buildTrustedDeviceLabel(typeof navigator !== "undefined" ? navigator.userAgent : "");
}

export async function listDevices(): Promise<DeviceRow[]> {
  return (await listTrustedDevices(supabase)) as DeviceRow[];
}

export interface DeviceCheckResult {
  status: "authorized" | "limit-reached";
  device?: DeviceRow;
}

export async function ensureDeviceAuthorized(): Promise<DeviceCheckResult> {
  // Omit platform/publicKey so AuthGate works before Owner Device Lock migration.
  const result = await ensureTrustedDeviceAuthorized(supabase, {
    deviceId: getOrCreateDeviceId(),
    deviceClass: getDeviceClass(),
    label: buildDeviceLabel(),
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  });
  return {
    status: result.status,
    device: result.device as DeviceRow | undefined,
  };
}

export async function removeDevice(id: string): Promise<void> {
  await removeTrustedDevice(supabase, id);
}

/** Soft-revoke (Owner Device Lock) — preferred when kicking a paired Apple shell. */
export async function revokeDevice(id: string): Promise<void> {
  await revokeTrustedDevice(supabase, id);
}

export function isThisDeviceSlot(row: DeviceRow): boolean {
  return isThisTrustedDeviceSlot(row, {
    deviceId: getOrCreateDeviceId(),
    deviceClass: getDeviceClass(),
  });
}
