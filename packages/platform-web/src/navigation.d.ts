import type { NavItemModel } from '@life-os/contracts/nav'

/** Web routing item — `tab` maps to NavItemModel.id */
export type WebNavItem = Omit<NavItemModel, 'id' | 'href'> & {
  tab: string
  href: string
  match: (pathname: string, search?: string) => boolean
  dotColor?: string
}

export type WebNavGroup = {
  label: string
  items: WebNavItem[]
}
