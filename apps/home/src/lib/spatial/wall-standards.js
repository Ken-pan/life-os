/**
 * US apartment floor-plan wall thickness (plan-view inches).
 * Interior: 2×4 @ 16" OC + 1/2" gypsum both sides ≈ 4.5".
 * Exterior: wood-frame perimeter ≈ 6" on published leasing plans.
 */

/** @typedef {'exterior' | 'interior'} WallRole */

export const US_WALL_EXTERIOR_IN = 6
export const US_WALL_INTERIOR_IN = 4.5

/** @param {WallRole} role @param {number} pxPerFt */
export function wallStrokePx(role, pxPerFt) {
  const inches = role === 'exterior' ? US_WALL_EXTERIOR_IN : US_WALL_INTERIOR_IN
  return Math.max(2, Math.round((inches / 12) * pxPerFt))
}
