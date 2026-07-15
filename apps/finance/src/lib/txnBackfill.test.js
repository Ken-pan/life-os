import { describe, it, expect } from 'vitest'
import { decideBackfill } from './txnBackfill.js'

const NOW = '2026-07-14T12:00:00.000Z'

describe('decideBackfill', () => {
  it('新缺口 → 发起 pending 请求，多个缺口并成一段', () => {
    const { request, state } = decideBackfill(
      [
        { from: '2026-06-05', to: '2026-06-12' },
        { from: '2026-06-14', to: '2026-06-23' },
      ],
      null,
      NOW,
    )
    expect(request).toEqual({ from: '2026-06-05', to: '2026-06-23' })
    expect(state).toMatchObject({ from: '2026-06-05', to: '2026-06-23', status: 'pending' })
  })

  it('已读过一次（done 覆盖该段）→ 不再请求，哪怕缺口还在', () => {
    // 关键场景：那段确实没消费，回读后缺口仍在——不能变成每次同步都深翻。
    const done = {
      from: '2026-06-05',
      to: '2026-06-23',
      status: 'done',
      requestedAt: '2026-07-10T00:00:00.000Z',
      doneAt: '2026-07-12T00:00:00.000Z',
    }
    const { request, state } = decideBackfill(
      [{ from: '2026-06-05', to: '2026-06-23' }],
      done,
      NOW,
    )
    expect(request).toBeNull()
    expect(state).toBe(done)
  })

  it('pending 未消费时继续带上请求，并合并新发现的缺口', () => {
    const pending = {
      from: '2026-06-14',
      to: '2026-06-23',
      status: 'pending',
      requestedAt: '2026-07-13T00:00:00.000Z',
    }
    const { request } = decideBackfill(
      [
        { from: '2026-06-05', to: '2026-06-12' },
        { from: '2026-06-14', to: '2026-06-23' },
      ],
      pending,
      NOW,
    )
    expect(request).toEqual({ from: '2026-06-05', to: '2026-06-23' })
  })

  it('pending 悬空超过 TTL → 作废，不在一个月后突然深翻', () => {
    const stale = {
      from: '2026-06-05',
      to: '2026-06-23',
      status: 'pending',
      requestedAt: '2026-06-01T00:00:00.000Z',
    }
    const { request, state } = decideBackfill(
      [{ from: '2026-06-05', to: '2026-06-23' }],
      stale,
      NOW,
    )
    expect(request).toBeNull()
    expect(state).toMatchObject({ status: 'done', reason: 'expired' })
  })

  it('done 之外冒出新缺口 → 允许为新段再发一次', () => {
    const done = {
      from: '2026-06-05',
      to: '2026-06-23',
      status: 'done',
      requestedAt: '2026-07-01T00:00:00.000Z',
      doneAt: '2026-07-02T00:00:00.000Z',
    }
    const { request, state } = decideBackfill(
      [{ from: '2026-07-01', to: '2026-07-08' }],
      done,
      NOW,
    )
    expect(request).toEqual({ from: '2026-07-01', to: '2026-07-08' })
    expect(state?.status).toBe('pending')
  })

  it('没有缺口 → 不请求，原状态原样保留', () => {
    const { request, state } = decideBackfill([], null, NOW)
    expect(request).toBeNull()
    expect(state).toBeNull()
  })
})
