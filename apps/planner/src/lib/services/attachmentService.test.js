import { describe, expect, it } from 'vitest'
import {
  namePastedImageFile,
  safeFilename,
  validateAttachmentFile,
} from './attachmentService.js'

function fakeFile(name, size, type = 'text/plain') {
  return { name, size, type }
}

describe('validateAttachmentFile', () => {
  it('accepts normal files under 25MB', () => {
    expect(validateAttachmentFile(fakeFile('notes.txt', 1024)).valid).toBe(true)
  })

  it('rejects oversized files', () => {
    const r = validateAttachmentFile(fakeFile('big.bin', 26 * 1024 * 1024))
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/25MB|too large/i)
  })

  it('rejects executable-like extensions', () => {
    expect(validateAttachmentFile(fakeFile('x.exe', 10)).valid).toBe(false)
    expect(validateAttachmentFile(fakeFile('run.sh', 10)).valid).toBe(false)
  })
})

describe('safeFilename', () => {
  it('strips path traversal and slashes', () => {
    expect(safeFilename('../../etc/passwd')).toBe('passwd')
    expect(safeFilename('a/b/c.png')).toBe('c.png')
  })

  it('strips non-ascii control-ish chars and caps length', () => {
    const long = 'a'.repeat(200) + '.pdf'
    expect(safeFilename(long).length).toBeLessThanOrEqual(100)
    expect(safeFilename('ok photo.jpg')).toBe('ok photo.jpg')
  })

  it('falls back when empty after sanitize', () => {
    expect(safeFilename('')).toBe('file')
  })
})

describe('namePastedImageFile (PLNR.ATTACH.1)', () => {
  it('renames generic clipboard image.png', () => {
    const blob = new File([new Uint8Array([1, 2, 3])], 'image.png', {
      type: 'image/png',
    })
    const named = namePastedImageFile(blob, Date.UTC(2026, 6, 18, 16, 30, 5))
    expect(named.name).toMatch(/^paste-\d{8}-\d{6}\.png$/)
    expect(named.type).toBe('image/png')
  })

  it('keeps explicit filenames', () => {
    const blob = new File([new Uint8Array([1])], 'receipt.jpg', {
      type: 'image/jpeg',
    })
    expect(namePastedImageFile(blob).name).toBe('receipt.jpg')
  })
})
