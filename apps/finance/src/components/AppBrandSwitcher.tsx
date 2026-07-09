import { useEffect, useMemo, useRef, useState } from 'react'
import {
  getLifeOsBrand,
  getLifeOsBrandMarkSize,
  type LifeOsAppId,
} from '@life-os/theme/brand'
import {
  getLifeOsAppBrandMark,
  getLifeOsAppOrigin,
  LIFE_OS_SWITCHER_APPS,
  filterLifeOsSwitcherApps,
  findSwitcherTypeAheadIndex,
} from '@life-os/theme'
import { useThemePreference } from '../hooks/useThemePreference'

type AppBrandSwitcherProps = {
  appId?: LifeOsAppId
  tagline?: string
  ariaLabel?: string
  className?: string
}

function BrandMarkImg({
  appId,
  size,
  className,
  lightSrc,
  darkSrc,
  lightSrcSet,
  darkSrcSet,
}: {
  appId?: LifeOsAppId
  size: number
  className?: string
  lightSrc?: string
  darkSrc?: string
  lightSrcSet?: string
  darkSrcSet?: string
}) {
  const brand = getLifeOsBrand(appId ?? 'finance')
  const [, , resolved] = useThemePreference()
  const src =
    lightSrc && darkSrc
      ? resolved === 'dark'
        ? darkSrc
        : lightSrc
      : resolved === 'dark'
        ? brand.dark
        : brand.light
  const srcSet =
    lightSrcSet && darkSrcSet
      ? resolved === 'dark'
        ? darkSrcSet
        : lightSrcSet
      : resolved === 'dark'
        ? brand.darkSrcSet
        : brand.lightSrcSet

  return (
    <img
      src={src}
      srcSet={srcSet}
      alt=""
      aria-hidden
      className={className}
      width={size}
      height={size}
    />
  )
}

export function AppBrandSwitcher({
  appId = 'finance',
  tagline,
  ariaLabel,
  className = '',
}: AppBrandSwitcherProps) {
  const brand = getLifeOsBrand(appId)
  const size = getLifeOsBrandMarkSize(appId, 'sidebar')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const typeAheadRef = useRef('')
  const typeAheadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filteredApps = useMemo(
    () => filterLifeOsSwitcherApps(LIFE_OS_SWITCHER_APPS, query),
    [query],
  )

  const resetMenuState = () => {
    setQuery('')
    typeAheadRef.current = ''
    if (typeAheadTimerRef.current) clearTimeout(typeAheadTimerRef.current)
  }

  const scrollToSelected = (index: number) => {
    requestAnimationFrame(() => {
      const items = listRef.current?.querySelectorAll('.brand-switcher-item')
      items?.[index]?.scrollIntoView({ block: 'nearest' })
    })
  }

  const openMenu = () => {
    const currentIndex = LIFE_OS_SWITCHER_APPS.findIndex(
      (entry) => entry.id === appId,
    )
    setSelectedIndex(currentIndex >= 0 ? currentIndex : 0)
    setOpen(true)
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      scrollToSelected(currentIndex >= 0 ? currentIndex : 0)
    })
  }

  const closeMenu = () => {
    setOpen(false)
    resetMenuState()
  }

  const navigateToApp = (targetId: LifeOsAppId) => {
    if (targetId === appId) {
      closeMenu()
      return
    }
    window.location.href = getLifeOsAppOrigin(targetId)
  }

  const activateSelected = () => {
    const entry = filteredApps[selectedIndex]
    if (entry) navigateToApp(entry.id)
  }

  const bumpTypeAhead = (char: string) => {
    typeAheadRef.current += char.toLowerCase()
    if (typeAheadTimerRef.current) clearTimeout(typeAheadTimerRef.current)
    typeAheadTimerRef.current = setTimeout(() => {
      typeAheadRef.current = ''
    }, 700)

    const matchIndex = findSwitcherTypeAheadIndex(
      filteredApps,
      typeAheadRef.current,
    )
    if (matchIndex >= 0) {
      setSelectedIndex(matchIndex)
      scrollToSelected(matchIndex)
      return
    }

    setQuery(typeAheadRef.current)
    setSelectedIndex(0)
    scrollToSelected(0)
  }

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node) || !rootRef.current?.contains(target)) {
        closeMenu()
      }
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open])

  const handleMenuKeydown = (event: React.KeyboardEvent) => {
    const { key } = event
    const count = filteredApps.length

    if (key === 'ArrowDown') {
      event.preventDefault()
      if (!count) return
      if (event.target === searchInputRef.current) {
        setSelectedIndex(0)
        scrollToSelected(0)
        return
      }
      setSelectedIndex((index) => {
        const next = (index + 1) % count
        scrollToSelected(next)
        return next
      })
      return
    }

    if (key === 'ArrowUp') {
      event.preventDefault()
      if (!count) return
      setSelectedIndex((index) => {
        const next = (index - 1 + count) % count
        scrollToSelected(next)
        return next
      })
      return
    }

    if (key === 'Home') {
      event.preventDefault()
      if (!count) return
      setSelectedIndex(0)
      scrollToSelected(0)
      return
    }

    if (key === 'End') {
      event.preventDefault()
      if (!count) return
      const last = count - 1
      setSelectedIndex(last)
      scrollToSelected(last)
      return
    }

    if (key === 'Enter') {
      event.preventDefault()
      activateSelected()
      return
    }

    if (key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }

    if (
      key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      event.target !== searchInputRef.current
    ) {
      event.preventDefault()
      bumpTypeAhead(key)
    }
  }

  const handleTriggerKeydown = (event: React.KeyboardEvent) => {
    if (
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault()
      if (!open) openMenu()
    }
  }

  return (
    <div className={`brand-switcher ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className="brand brand-switcher-trigger"
        aria-label={ariaLabel || `${brand.fullName} · 切换应用`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeydown}
      >
        <BrandMarkImg appId={appId} size={size} className="brand-mark" />
        <span className="brand-copy">
          <span className="brand-name">
            <span className="brand-name-base">{brand.wordmarkBase}</span>
            <span className="brand-name-accent">{brand.wordmarkAccent}</span>
          </span>
          {tagline ? <span className="brand-tag">{tagline}</span> : null}
        </span>
      </button>

      {open ? (
        <div
          className="brand-switcher-menu"
          role="menu"
          aria-label="切换 Life OS 应用"
          onKeyDown={handleMenuKeydown}
        >
          <div className="brand-switcher-search-wrap">
            <input
              ref={searchInputRef}
              type="search"
              className="brand-switcher-search"
              placeholder="搜索应用…"
              aria-label="搜索 Life OS 应用"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setSelectedIndex(0)
              }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="brand-switcher-list" role="none" ref={listRef}>
            {filteredApps.length === 0 ? (
              <p className="brand-switcher-empty">没有匹配的应用</p>
            ) : (
              filteredApps.map((entry, index) => {
                const itemBrand = getLifeOsBrand(entry.id)
                const itemMark = getLifeOsAppBrandMark(entry.id)
                const isCurrent = entry.id === appId
                const isActive = index === selectedIndex
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`brand-switcher-item${isCurrent ? ' brand-switcher-item--current' : ''}${isActive ? ' brand-switcher-item--active' : ''}`}
                    role="menuitem"
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => navigateToApp(entry.id)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <BrandMarkImg
                      size={28}
                      className="brand-switcher-item-mark"
                      lightSrc={itemMark.light}
                      darkSrc={itemMark.dark}
                      lightSrcSet={itemMark.lightSrcSet}
                      darkSrcSet={itemMark.darkSrcSet}
                    />
                    <span className="brand-switcher-item-copy">
                      <span className="brand-switcher-item-name">
                        <span className="brand-name-base">
                          {itemBrand.wordmarkBase}
                        </span>
                        <span className="brand-name-accent">
                          {itemBrand.wordmarkAccent}
                        </span>
                      </span>
                      {entry.experimental ? (
                        <span className="brand-switcher-item-badge">实验</span>
                      ) : null}
                    </span>
                    {isCurrent ? (
                      <span
                        className="brand-switcher-item-check"
                        aria-hidden="true"
                      >
                        ✓
                      </span>
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
