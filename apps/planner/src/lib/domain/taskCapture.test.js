import { describe, expect, it } from 'vitest'
import {
  filterCaptureProjects,
  parseQuickAddTokens,
  projectQueryFromTitle,
  titleWithoutProjectQuery,
} from './taskCapture.js'

const projects = [
  { id: '1', title: 'Life OS' },
  { id: '2', title: 'Portfolio' },
  { id: '3', title: '作品集' },
]

describe('task capture project syntax', () => {
  it('recognizes only a trailing @ project query', () => {
    expect(projectQueryFromTitle('写周报 @life')).toBe('life')
    expect(projectQueryFromTitle('@')).toBe('')
    expect(projectQueryFromTitle('mail ken@example.com')).toBeNull()
  })

  it('removes the capture syntax from the persisted title', () => {
    expect(titleWithoutProjectQuery('写周报 @life')).toBe('写周报')
  })

  it('filters projects case-insensitively', () => {
    expect(filterCaptureProjects(projects, 'PORT').map((p) => p.id)).toEqual(['2'])
  })
})

describe('parseQuickAddTokens', () => {
  const today = '2026-07-14' // 周二

  it('解析日期 / 优先级 / 标签并从标题剥离', () => {
    expect(parseQuickAddTokens('写周报 明天 !高 #工作', today)).toEqual({
      title: '写周报',
      dueDate: '2026-07-15',
      priority: 'P1',
      tags: ['工作'],
    })
  })

  it('识别相对日期词', () => {
    expect(parseQuickAddTokens('a 今天', today).dueDate).toBe('2026-07-14')
    expect(parseQuickAddTokens('a 明天', today).dueDate).toBe('2026-07-15')
    expect(parseQuickAddTokens('a 后天', today).dueDate).toBe('2026-07-16')
    expect(parseQuickAddTokens('a 大后天', today).dueDate).toBe('2026-07-17')
  })

  it('识别本周/下周星期', () => {
    expect(parseQuickAddTokens('a 周三', today).dueDate).toBe('2026-07-15')
    expect(parseQuickAddTokens('a 周二', today).dueDate).toBe('2026-07-14') // 含今天
    expect(parseQuickAddTokens('a 周一', today).dueDate).toBe('2026-07-20') // 已过 → 下一次
    expect(parseQuickAddTokens('a 下周三', today).dueDate).toBe('2026-07-22')
    expect(parseQuickAddTokens('a 星期日', today).dueDate).toBe('2026-07-19')
  })

  it('识别优先级词与全角感叹号', () => {
    expect(parseQuickAddTokens('a !高', today).priority).toBe('P1')
    expect(parseQuickAddTokens('a !中', today).priority).toBe('P2')
    expect(parseQuickAddTokens('a !低', today).priority).toBe('P3')
    expect(parseQuickAddTokens('a !p0', today).priority).toBe('P0')
    expect(parseQuickAddTokens('a !急', today).priority).toBe('P0')
    expect(parseQuickAddTokens('a ！高', today).priority).toBe('P1')
  })

  it('支持多个标签并去重', () => {
    expect(parseQuickAddTokens('a #工作 #紧急 #工作', today).tags).toEqual([
      '工作',
      '紧急',
    ])
  })

  it('不误伤正文中嵌入的关键词', () => {
    const r = parseQuickAddTokens('研究明天的天气', today)
    expect(r.title).toBe('研究明天的天气')
    expect(r.dueDate).toBeNull()
  })

  it('纯 token 输入时标题为空（由调用方回退原文）', () => {
    expect(parseQuickAddTokens('明天', today)).toEqual({
      title: '',
      dueDate: '2026-07-15',
      priority: null,
      tags: [],
    })
  })

  it('普通标题不受影响', () => {
    expect(parseQuickAddTokens('买牛奶', today)).toEqual({
      title: '买牛奶',
      dueDate: null,
      priority: null,
      tags: [],
    })
  })
})

