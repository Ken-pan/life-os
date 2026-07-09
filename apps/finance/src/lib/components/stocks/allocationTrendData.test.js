import { describe, expect, it } from 'vitest'
import {
  buildAllocationTrendMeta,
  fmtDelta,
  xAt,
  yAt,
  CHART_H,
} from './allocationTrendData.js'

const twoPoints = [
  {
    snapshotId: 'hs_old',
    ts: Date.parse('2026-05-01'),
    dateLabel: '5/1',
    stockPct: 88,
    etfPct: 12,
    top1Pct: 40,
    top3Pct: 80,
  },
  {
    snapshotId: 'hs_new',
    ts: Date.parse('2026-06-01'),
    dateLabel: '6/1',
    stockPct: 84,
    etfPct: 16,
    top1Pct: 33.5,
    top3Pct: 73.5,
  },
]

describe('allocationTrendData', () => {
  it('reports insufficient points when fewer than 2 snapshots', () => {
    const meta = buildAllocationTrendMeta([twoPoints[0]], undefined)
    expect(meta.hasEnoughPoints).toBe(false)
  })

  it('computes deltas for 2+ snapshots', () => {
    const meta = buildAllocationTrendMeta(twoPoints, undefined)
    expect(meta.hasEnoughPoints).toBe(true)
    expect(meta.stockDelta).toBe(-4)
    expect(meta.top3Delta).toBe(-6.5)
    expect(fmtDelta(meta.stockDelta)).toBe('-4.0%')
    expect(fmtDelta(meta.top3Delta)).toBe('-6.5%')
  })

  it('derives target band bounds when target is set', () => {
    const meta = buildAllocationTrendMeta(twoPoints, {
      stockPct: 35,
      top3MaxPct: 45,
      driftThresholdPct: 5,
    })
    expect(meta.hasStockTarget).toBe(true)
    expect(meta.hasTop3Target).toBe(true)
    expect(meta.stockBandTop).toBe(40)
    expect(meta.stockBandBottom).toBe(30)
    expect(meta.top3Target).toBe(45)
  })

  it('keeps y coordinates within the viewBox for extreme values', () => {
    const extreme = twoPoints.map((p, i) => ({
      ...p,
      stockPct: i === 0 ? 0 : 100,
      top3Pct: i === 0 ? 120 : -5,
    }))
    for (const p of extreme) {
      const cy = yAt(p.stockPct)
      expect(cy).toBeGreaterThanOrEqual(0)
      expect(cy).toBeLessThanOrEqual(CHART_H)
      const cyTop3 = yAt(p.top3Pct)
      expect(cyTop3).toBeGreaterThanOrEqual(0)
      expect(cyTop3).toBeLessThanOrEqual(CHART_H)
    }
    expect(xAt(0, extreme.length)).toBeGreaterThanOrEqual(0)
    expect(xAt(1, extreme.length)).toBeLessThanOrEqual(560)
  })
})
