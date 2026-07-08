import { useThemePreference } from '../hooks/useThemePreference'

type BrandMarkProps = {
  size?: number
  className?: string
}

const CIRCLE_96 = {
  light: '/assets/brand/brand-circle-light-96.png',
  dark: '/assets/brand/brand-circle-dark-96.png',
} as const

const CIRCLE_48 = {
  light: '/assets/brand/brand-circle-light-48.png',
  dark: '/assets/brand/brand-circle-dark-48.png',
} as const

export function BrandMark({ size = 28, className = '' }: BrandMarkProps) {
  const [, , resolved] = useThemePreference()
  const src = resolved === 'dark' ? CIRCLE_96.dark : CIRCLE_96.light
  const srcSet =
    resolved === 'dark'
      ? `${CIRCLE_48.dark} 1x, ${CIRCLE_96.dark} 2x`
      : `${CIRCLE_48.light} 1x, ${CIRCLE_96.light} 2x`

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
