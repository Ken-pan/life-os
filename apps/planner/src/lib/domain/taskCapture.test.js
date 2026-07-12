import { describe, expect, it } from 'vitest'
import {
  filterCaptureProjects,
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

