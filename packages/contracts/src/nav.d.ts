/** cross-surface route presentation hint. */
export type RouteKind = 'tab' | 'stack' | 'modal' | 'external'

/** cross-surface -> Swift: struct NavItemModel: Codable, Identifiable */
export type NavItemModel = {
  /** Primary route id; native resolves this without a pathname. */
  id: string
  label: string
  /** Semantic icon name; each platform resolves to its own icon set. */
  icon: string
  /** Web-only pathname, e.g. "/search". Omit on native. */
  href?: string
  /** Cross-surface destination presentation. */
  routeKind?: RouteKind
}

/** cross-surface nav grouping for sidebar / more sheet style surfaces. */
export type NavGroupModel = {
  id: string
  label?: string
  items: NavItemModel[]
}

/** cross-surface -> Swift: enum NavPresentation: String, Codable */
export type NavPresentation = 'tabBar' | 'sidebar' | 'moreSheet'

export type SegOption = {
  id: string
  label: string
}

/** cross-surface segmented control / filter chip model. */
export type SegControlModel = {
  value: string
  options: SegOption[]
  mode: 'single' | 'multi'
}
