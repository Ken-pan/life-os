import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_PWA_SETTINGS, normalizePwaSettings } from '@life-os/theme'

const STORAGE_KEY = 'fos-pwa-settings'

export function readPwaSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    return normalizePwaSettings(raw)
  } catch {
    return { ...DEFAULT_PWA_SETTINGS }
  }
}

function persistPwaSettings(settings: ReturnType<typeof normalizePwaSettings>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function usePwaSettings() {
  const [settings, setSettings] = useState(readPwaSettings)

  const setLockPortraitOnPhone = useCallback((lockPortraitOnPhone: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, lockPortraitOnPhone }
      persistPwaSettings(next)
      return next
    })
  }, [])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return
      setSettings(readPwaSettings())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { settings, setLockPortraitOnPhone }
}
