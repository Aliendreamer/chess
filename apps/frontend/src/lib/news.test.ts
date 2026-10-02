import { describe, expect, it } from 'vitest'
import { ageText, hostOf, timeControlLabel } from './news'

describe('news helpers', () => {
  const now = Date.parse('2026-10-02T15:00:00Z')

  it('writes an age the way people say it', () => {
    expect(ageText('2026-10-02T14:59:30Z', now)).toBe('just now')
    expect(ageText('2026-10-02T14:15:00Z', now)).toBe('45 min ago')
    expect(ageText('2026-10-02T10:00:00Z', now)).toBe('5 h ago')
    expect(ageText('2026-09-30T15:00:00Z', now)).toBe('2 days ago')
    expect(ageText('2026-10-01T14:00:00Z', now)).toBe('1 day ago')
  })

  it('names a link by its site for screen readers', () => {
    expect(hostOf('https://en.chessbase.com/post/x')).toBe('en.chessbase.com')
    expect(hostOf('not a url')).toBe('')
  })

  it('names lichess time controls as the club does', () => {
    expect(timeControlLabel('standard')).toBe('Classical')
    expect(timeControlLabel('rapid')).toBe('Rapid')
    expect(timeControlLabel('blitz')).toBe('Blitz')
    expect(timeControlLabel(null)).toBe('')
  })
})
