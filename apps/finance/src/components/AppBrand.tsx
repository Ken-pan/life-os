import {
  getLifeOsBrand,
  getLifeOsBrandMarkSize,
  type LifeOsAppId,
  type LifeOsBrandVariant,
} from '@life-os/theme/brand'
import { useThemePreference } from '../hooks/useThemePreference'

type AppBrandProps = {
  appId?: LifeOsAppId
  variant?: LifeOsBrandVariant
  tagline?: string
  ariaLabel?: string
  className?: string
}

function BrandMarkImg({
  appId,
  size,
  className,
}: {
  appId: LifeOsAppId
  size: number
  className?: string
}) {
  const brand = getLifeOsBrand(appId)
  const [, , resolved] = useThemePreference()
  const src = resolved === 'dark' ? brand.dark : brand.light
  const srcSet = resolved === 'dark' ? brand.darkSrcSet : brand.lightSrcSet

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

export function AppBrand({
  appId = 'finance',
  variant = 'sidebar',
  tagline,
  ariaLabel,
  className = '',
}: AppBrandProps) {
  const brand = getLifeOsBrand(appId)
  const size = getLifeOsBrandMarkSize(appId, variant)
  const isSidebar = variant === 'sidebar'
  const isHeader = variant === 'header'
  const isAuth = variant === 'auth'

  if (isAuth) {
    return (
      <div className={`auth-card__brand ${className}`.trim()}>
        <BrandMarkImg appId={appId} size={size} className="auth-card__logo" />
        <h1 className="auth-card__title brand-wordmark">
          <span className="brand-name-base">{brand.wordmarkBase}</span>
          <span className="brand-name-accent"> {brand.wordmarkAccent}</span>
        </h1>
      </div>
    )
  }

  const markClass = isSidebar
    ? 'brand-mark'
    : isHeader
      ? 'page-header-brand-mark'
      : 'appbar-brand-mark'

  const shellClass = [
    'brand',
    variant === 'appbar' ? 'appbar-brand' : '',
    isHeader ? 'page-header-brand' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const copyClass = isSidebar ? 'brand-copy' : 'appbar-brand-copy'
  const wordmarkClass = isSidebar
    ? 'brand-name'
    : isHeader
      ? 'page-header-brand-name'
      : 'appbar-brand-name'

  return (
    <div className={shellClass} aria-label={ariaLabel || brand.fullName}>
      <BrandMarkImg appId={appId} size={size} className={markClass} />
      <span className={copyClass}>
        <span className={wordmarkClass}>
          <span className="brand-name-base">{brand.wordmarkBase}</span>
          <span className="brand-name-accent">{brand.wordmarkAccent}</span>
        </span>
        {tagline && isSidebar ? <span className="brand-tag">{tagline}</span> : null}
      </span>
    </div>
  )
}
