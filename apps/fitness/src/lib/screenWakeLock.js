import { createScreenWakeLock } from '@life-os/platform-web/wake-lock';

const wakeLock = createScreenWakeLock();

export const screenWakeLockSupported = wakeLock.supported;
export const acquireScreenWakeLock = wakeLock.acquire;
export const releaseScreenWakeLock = wakeLock.release;
export const bindScreenWakeLock = wakeLock.bind;
export const bindScreenWakeLockWithGestureFallback = wakeLock.bindWithGestureFallback;
