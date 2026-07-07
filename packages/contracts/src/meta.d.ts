import type { BrandThemeID } from './appearance'

/** cross-surface -> Swift: struct PageMetadata: Codable */
export type PageMetadata = {
  appId: BrandThemeID
  title: string
  /** BCP 47 locale hint, e.g. "zh-CN" or "en". */
  locale?: string
}
