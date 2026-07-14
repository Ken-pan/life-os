// 商户 Logo 解析：原始账单描述 → 品牌 id → 自托管资源路径。
//
// 归一化规则在 finance-core（纯函数、可测），资源由 scripts/fetch-merchant-logos.mjs
// 生成，id 清单由该脚本自动写出——三者对不上的时候只会「回落占位符」，不会碎。
import { merchantBrandKey } from '../engine/merchantBrand.js'
import { MERCHANT_LOGO_IDS } from './merchantLogoIds.js'

/** @param {string | undefined | null} merchant */
export function merchantLogoId(merchant) {
  const id = merchantBrandKey(merchant)
  return id && MERCHANT_LOGO_IDS.has(id) ? id : null
}

/** 自托管路径；没有对应资源时返回 null（由 UI 显示中性占位符）。 */
export function merchantLogoSrc(merchant) {
  const id = merchantLogoId(merchant)
  return id ? `/assets/merchants/${id}.svg` : null
}
